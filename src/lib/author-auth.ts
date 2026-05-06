import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthorById } from "@/db/queries/authors";
import {
  checkAuthorPermission,
  listAuthorPermissions,
} from "@/lib/author-permission-service";
import type { AuthorPermission } from "@/lib/author-permissions";
import {
  AUTHOR_SESSION_COOKIE_NAME,
  AUTHOR_SESSION_MAX_AGE_SECONDS,
  createAuthorSessionToken,
  verifyAuthorSessionToken,
} from "@/lib/author-session";

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

  if (!author || author.code !== payload.authorCode) {
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

export async function getCurrentAuthorPermissions() {
  const author = await getCurrentAuthor();

  return author ? listAuthorPermissions(author.id) : [];
}

export async function currentAuthorHasPermission(permission: AuthorPermission) {
  const author = await getCurrentAuthor();

  return author ? checkAuthorPermission(author.id, permission) : false;
}

export async function setAuthorSessionCookie(authorId: number, authorCode: string) {
  const token = createAuthorSessionToken(authorId, authorCode);

  (await cookies()).set({
    name: AUTHOR_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
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
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
