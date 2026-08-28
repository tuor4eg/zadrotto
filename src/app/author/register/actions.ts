"use server";

import { redirect } from "next/navigation";

import {
  registerAuthorAccount,
  replacePendingAuthorRegistrationEmail,
} from "@/db/operations/author-auth";
import { getAuthorAccountByNormalizedLogin } from "@/db/queries/author-auth";
import { isValidAuthorEmail, isValidAuthorLogin, normalizeAuthorEmail, normalizeAuthorLogin, validateAuthorPassword } from "@/lib/auth/author-account";
import {
  isAuthorEmailDeliveryConfigured,
  isAuthorEmailVerificationBypassed,
  isAuthorRegistrationEnabled,
} from "@/lib/auth/features";
import { checkAuthorAuthMutationRateLimit } from "@/lib/auth/mutation-rate-limit";
import { hashPassword, verifyPasswordOrDummy } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity-logs/server";
import { getUniqueViolationConstraint } from "@/lib/common/app-error-messages";

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export type AuthorRegistrationState = {
  error: "email-taken" | "invalid" | "login-taken" | "unavailable";
} | null;

export async function registerAuthorAction(
  _previousState: AuthorRegistrationState,
  formData: FormData,
): Promise<AuthorRegistrationState> {
  const bypassEmailVerification = isAuthorEmailVerificationBypassed();
  if (!isAuthorRegistrationEnabled()) redirect("/author/login");
  if (!bypassEmailVerification && !(await isAuthorEmailDeliveryConfigured())) {
    return { error: "unavailable" };
  }
  const name = read(formData, "name");
  const login = read(formData, "login");
  const email = read(formData, "email");
  const password = read(formData, "password");
  const confirmation = read(formData, "passwordConfirmation");
  const honeypot = read(formData, "website");
  const formStartedAt = Number(read(formData, "formStartedAt"));
  const fillTime = Date.now() - formStartedAt;
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-register", normalizeAuthorEmail(email));
  if (!rateLimit.ok) return { error: "unavailable" };
  if (honeypot || !Number.isFinite(formStartedAt) || fillTime < 1500 || fillTime > 60 * 60 * 1000
    || !name || !isValidAuthorLogin(login) || !isValidAuthorEmail(email)
    || password !== confirmation || !validateAuthorPassword(password).ok) {
    return { error: "invalid" };
  }
  const normalizedLogin = normalizeAuthorLogin(login);
  const normalizedEmail = normalizeAuthorEmail(email);
  let registeredAuthorId: number | null = null;
  let correctedPendingEmail = false;
  try {
    const author = await registerAuthorAccount({
      name,
      login,
      normalizedLogin,
      passwordHash: await hashPassword(password),
      email,
      normalizedEmail,
    });
    registeredAuthorId = author.id;
  } catch (error) {
    const constraint = getUniqueViolationConstraint(error);

    if (constraint === "author_accounts_normalized_login_unique") {
      try {
        const account = await getAuthorAccountByNormalizedLogin(normalizedLogin);
        const passwordMatches = await verifyPasswordOrDummy(password, account?.passwordHash);
        if (account?.status === "pending_email" && passwordMatches) {
          const corrected = await replacePendingAuthorRegistrationEmail({
            authorId: account.authorId,
            email,
            normalizedEmail,
          });
          registeredAuthorId = corrected?.authorId ?? null;
          correctedPendingEmail = Boolean(corrected);
        }
      } catch (correctionError) {
        if (getUniqueViolationConstraint(correctionError) === "author_emails_normalized_email_unique") {
          return { error: "email-taken" };
        }
        console.error("Failed to correct pending author registration email", correctionError);
        return { error: "unavailable" };
      }

      if (!registeredAuthorId) return { error: "login-taken" };
    } else if (constraint === "author_emails_normalized_email_unique") {
      return { error: "email-taken" };
    } else {
      console.error("Failed to register author account", error);
      return { error: "unavailable" };
    }
  }
  if (registeredAuthorId) {
    await logActivity({
      action: "author.registration.submitted",
      actorType: "author",
      authorId: registeredAuthorId,
      entityType: "author-account",
      entityId: registeredAuthorId,
      message: correctedPendingEmail
        ? "Автор исправил неподтверждённый email регистрации."
        : bypassEmailVerification
        ? "Автор зарегистрирован без подтверждения email."
        : "Отправлена заявка на регистрацию автора.",
      metadata: {
        source: "public-registration",
        emailVerificationBypassed: bypassEmailVerification,
        correctedPendingEmail,
      },
    });
  }
  redirect(bypassEmailVerification
    ? "/author/register?registered=1"
    : `/author/register?sent=1&email=${encodeURIComponent(email)}`);
}
