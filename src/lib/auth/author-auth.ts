import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthorById } from "@/db/queries/authors";
import {
  AUTHOR_SESSION_COOKIE_NAME,
  AUTHOR_SESSION_MAX_AGE_SECONDS,
  createAuthorSessionToken,
  verifyAuthorSessionToken,
} from "@/lib/auth/author-session";
import { shouldUseSecureCookies } from "@/lib/auth/cookies";

export async function getCurrentAuthor() {
  const token = (await cookies()).get(AUTHOR_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = verifyAuthorSessionToken(token);

  if (!payload || payload.type !== "author") {
    return null;
  }

  const author = await getAuthorById(payload.authorId);

  if (!author || author.code !== payload.authorCode || author.blockedAt) {
    return null;
  }

  return author;
}

export async function requireAuthor() {
  const author = await getCurrentAuthor();

  if (!author) {
    redirect("/author/login");
  }

  return author;
}

export async function setAuthorSessionCookie(authorId: number, authorCode: string) {
  const token = createAuthorSessionToken(authorId, authorCode);

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
  (await cookies()).set({
    name: AUTHOR_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 0,
  });
}
