import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

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
  return (await getCurrentAuthorSession())?.author ?? null;
}

export async function requireAuthor() {
  const author = await getCurrentAuthor();

  if (!author) {
    redirect("/author/login");
  }

  return author;
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
