import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { hasRequiredPersonalDataConsent } from "@/db/queries/personal-data-consent";

import { createAuthorSession } from "@/db/operations/author-auth";
import {
  getActiveAuthorSessionByTokenHash,
  revokeAuthorSessionByTokenHash,
  touchAuthorSession,
} from "@/db/queries/author-auth";
import { getAuthorById } from "@/db/queries/authors";
import {
  AUTHOR_SESSION_COOKIE_NAME,
  AUTHOR_SESSION_MAX_AGE_SECONDS,
  hashAuthorSessionToken,
} from "@/lib/auth/author-session";
import type { AuthorAuthMethod } from "@/lib/auth/author-account-model";
import { shouldUseSecureCookies } from "@/lib/auth/cookies";

export async function getCurrentAuthorSession() {
  const token = (await cookies()).get(AUTHOR_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await getActiveAuthorSessionByTokenHash(hashAuthorSessionToken(token));

  if (!session) {
    return null;
  }

  const author = await getAuthorById(session.authorId);

  if (!author || author.code !== session.authorCode || author.blockedAt) {
    return null;
  }

  await touchAuthorSession(session.sessionId);
  return { author, session };
}

export async function getCurrentAuthor() {
  const current = await getCurrentAuthorSession();
  return current && await hasRequiredPersonalDataConsent(current.author.id) ? current.author : null;
}

/** Account actions and protected pages must use this instead of the raw session. */
export async function requireAuthorSession() {
  const current = await getCurrentAuthorSession();
  if (!current) redirect("/author/login");
  if (!(await hasRequiredPersonalDataConsent(current.author.id))) redirect("/author/consent");
  return current;
}

export async function requireAuthor() {
  return (await requireAuthorSession()).author;
}

/** Route handlers retain their existing unauthenticated behavior, but cannot bypass consent. */
export async function getPersonalDataConsentDenial() {
  const current = await getCurrentAuthorSession();
  if (current && !(await hasRequiredPersonalDataConsent(current.author.id))) {
    return Response.json({ error: "consent_required", code: "consent_required" }, {
      status: 403, headers: { "Cache-Control": "no-store" },
    });
  }
  return null;
}

export async function setAuthorSessionCookie(
  authorId: number,
  authMethod: AuthorAuthMethod = "access_token",
) {
  const requestHeaders = await headers();
  const { token } = await createAuthorSession({
    authorId,
    authMethod,
    ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
  });

  await writeAuthorSessionCookie(token);
}

// Also used after a session is created atomically with an external identity operation.
export async function writeAuthorSessionCookie(token: string) {
  (await cookies()).set({
    name: AUTHOR_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: AUTHOR_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAuthorSessionCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTHOR_SESSION_COOKIE_NAME)?.value;

  if (token) {
    await revokeAuthorSessionByTokenHash(hashAuthorSessionToken(token));
  }

  cookieStore.set({
    name: AUTHOR_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 0,
  });
}
