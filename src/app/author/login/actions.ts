"use server";

import { redirect } from "next/navigation";

import {
  getActiveAuthorAccountByLoginOrEmail,
  getAuthorAccountByAuthorId,
} from "@/db/queries/author-auth";
import {
  getAuthorByAccessTokenHash,
  updateAuthorAccessTokenLastUsedAt,
} from "@/db/queries/author-access-tokens";
import {
  AUTHOR_AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  getAuthRequestIpAddress,
} from "@/lib/auth/rate-limits";
import { hashAuthorAccessToken } from "@/lib/authors/access-token";
import { setAuthorSessionCookie } from "@/lib/auth/author-auth";
import { normalizeAuthorLogin } from "@/lib/auth/author-account";
import { hashOpaqueToken } from "@/lib/auth/opaque-token";
import { verifyPasswordOrDummy } from "@/lib/auth/password";
import {
  clearAuthorLoginChallenge,
  getAuthorLoginChallengeState,
  recordAuthorLoginFailure,
} from "@/lib/auth/login-turnstile-challenge";
import { getTurnstileSiteKey, verifyTurnstileToken } from "@/lib/auth/turnstile";
import { logActivity } from "@/lib/activity-logs/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function loginAuthor(formData: FormData) {
  const result = await loginAuthorInline(null, formData);

  if (!result.ok) {
    redirect(`/author/login?error=${result.error}`);
  }

  redirect("/author/profile");
}

export type AuthorLoginState =
  | { ok: false; error: "invalid" | "rate-limit" | "rate-limit-unavailable" }
  | { ok: true; onboarding?: boolean }
  | null;

export type AuthorPasswordLoginState =
  | {
      ok: false;
      error: "invalid" | "rate-limit" | "rate-limit-unavailable" | "turnstile";
      challengeRequired?: boolean;
      turnstileSiteKey?: string;
    }
  | { ok: true; onboarding?: boolean }
  | null;

type AuthorLoginResult = Exclude<AuthorLoginState, null>;
type AuthorPasswordLoginResult = Exclude<AuthorPasswordLoginState, null>;

async function checkAuthorLoginRateLimit(
  scope: "author-password" | "author-access-token",
  identitySubject: string | null,
  ipAddress?: string,
) {
  return checkAuthRateLimit({
    scope,
    ipAddress: ipAddress ?? await getAuthRequestIpAddress(),
    identitySubject,
    limits: AUTHOR_AUTH_RATE_LIMITS,
  });
}

export async function loginAuthorWithPasswordInline(
  _previousState: AuthorPasswordLoginState,
  formData: FormData,
): Promise<AuthorPasswordLoginResult> {
  const identity = normalizeAuthorLogin(getFormString(formData, "identity"));
  const password = getFormString(formData, "password");
  const turnstileToken = getFormString(formData, "turnstileToken");
  const ipAddress = await getAuthRequestIpAddress();
  const rateLimit = await checkAuthorLoginRateLimit(
    "author-password",
    identity ? hashOpaqueToken(identity) : null,
    ipAddress,
  );

  if (!rateLimit.ok) {
    return {
      ok: false,
      error: rateLimit.reason === "limited" ? "rate-limit" : "rate-limit-unavailable",
    };
  }

  const challengeSubject = { ipAddress, normalizedLogin: identity };
  const challengeState = await getAuthorLoginChallengeState(challengeSubject);
  if (!challengeState.ok) return { ok: false, error: "rate-limit-unavailable" };

  if (challengeState.challengeRequired) {
    const siteKey = getTurnstileSiteKey();
    if (!siteKey) return { ok: false, error: "rate-limit-unavailable" };

    const turnstile = await verifyTurnstileToken(turnstileToken, {
      expectedAction: "author_login",
    });
    if (!turnstile.ok) {
      await logActivity({
        action: "author.login.failed",
        actorType: "author",
        status: "failure",
        message: "Неудачная попытка входа автора.",
        metadata: {
          authMethod: "password",
          challengeRequired: true,
          credentialProvided: Boolean(identity && password),
        },
      });
      return {
        ok: false,
        error: "turnstile",
        challengeRequired: true,
        turnstileSiteKey: siteKey,
      };
    }
  }

  const account = identity ? await getActiveAuthorAccountByLoginOrEmail(identity) : null;
  const passwordMatches = await verifyPasswordOrDummy(password, account?.passwordHash);

  if (!account || !passwordMatches) {
    await logActivity({
      action: "author.login.failed",
      actorType: "author",
      status: "failure",
      message: "Неудачная попытка входа автора.",
      metadata: { authMethod: "password", credentialProvided: Boolean(identity && password) },
    });
    const nextChallengeState = await recordAuthorLoginFailure(challengeSubject);
    if (!nextChallengeState.ok) return { ok: false, error: "rate-limit-unavailable" };

    const siteKey = nextChallengeState.challengeRequired ? getTurnstileSiteKey() : null;
    if (nextChallengeState.challengeRequired && !siteKey) {
      return { ok: false, error: "rate-limit-unavailable" };
    }

    return {
      ok: false,
      error: "invalid",
      challengeRequired: nextChallengeState.challengeRequired || undefined,
      turnstileSiteKey: siteKey ?? undefined,
    };
  }

  const challengeCleared = await clearAuthorLoginChallenge(challengeSubject);
  if (!challengeCleared.ok) return { ok: false, error: "rate-limit-unavailable" };

  await setAuthorSessionCookie(account.authorId, "password");
  await logActivity({
    action: "author.login",
    actorType: "author",
    authorId: account.authorId,
    message: "Автор вошел по паролю.",
    metadata: { authMethod: "password" },
  });
  return { ok: true };
}

export async function loginAuthorInline(
  _previousState: AuthorLoginState,
  formData: FormData,
): Promise<AuthorLoginResult> {
  const accessToken = getFormString(formData, "accessToken");
  const tokenHash = accessToken ? hashAuthorAccessToken(accessToken) : "";
  const rateLimit = await checkAuthorLoginRateLimit("author-access-token", tokenHash || null);

  if (!rateLimit.ok) {
    await logActivity({
      action: "author.login.failed",
      actorType: "author",
      status: "failure",
      message:
        rateLimit.reason === "limited"
          ? "Слишком много попыток входа."
          : "Rate limit недоступен.",
      severity: rateLimit.reason === "unavailable" ? "critical" : "warning",
      metadata: {
        credentialProvided: Boolean(accessToken),
      },
    });
    return {
      ok: false,
      error: rateLimit.reason === "limited" ? "rate-limit" : "rate-limit-unavailable",
    };
  }

  const tokenRecord = tokenHash ? await getAuthorByAccessTokenHash(tokenHash) : null;

  if (!tokenRecord) {
    await logActivity({
      action: "author.login.failed",
      actorType: "author",
      status: "failure",
      message: "Неверный токен автора.",
      metadata: {
        credentialProvided: Boolean(accessToken),
      },
    });
    return { ok: false, error: "invalid" };
  }

  await updateAuthorAccessTokenLastUsedAt(tokenRecord.id);
  await setAuthorSessionCookie(tokenRecord.authorId, "access_token");
  const account = await getAuthorAccountByAuthorId(tokenRecord.authorId);
  await logActivity({
    action: "author.login",
    actorType: "author",
    authorId: tokenRecord.authorId,
    message: "Автор вошел по токену доступа.",
  });

  return { ok: true, onboarding: !account };
}
