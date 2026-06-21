"use server";

import { redirect } from "next/navigation";

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
import { logActivity } from "@/lib/activity-logs/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function loginAuthor(formData: FormData) {
  const accessToken = getFormString(formData, "accessToken");
  const tokenHash = accessToken ? hashAuthorAccessToken(accessToken) : "";
  const rateLimit = await checkAuthRateLimit({
    scope: "author",
    ipAddress: await getAuthRequestIpAddress(),
    identitySubject: tokenHash || null,
    limits: AUTHOR_AUTH_RATE_LIMITS,
  });

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
    redirect(
      `/author/login?error=${
        rateLimit.reason === "limited" ? "rate-limit" : "rate-limit-unavailable"
      }`,
    );
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
    redirect("/author/login?error=invalid");
  }

  await updateAuthorAccessTokenLastUsedAt(tokenRecord.id);
  await setAuthorSessionCookie(tokenRecord.authorId, tokenRecord.authorCode);
  await logActivity({
    action: "author.login",
    actorType: "author",
    authorId: tokenRecord.authorId,
    message: "Автор вошел по токену доступа.",
  });

  redirect("/author");
}
