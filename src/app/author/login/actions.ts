"use server";

import { redirect } from "next/navigation";

import {
  getAuthorByAccessTokenHash,
  updateAuthorAccessTokenLastUsedAt,
} from "@/db/queries/author-access-tokens";
import { hashAuthorAccessToken } from "@/lib/author-access-token";
import { setAuthorSessionCookie } from "@/lib/author-auth";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function loginAuthor(formData: FormData) {
  const accessToken = getFormString(formData, "accessToken");
  const tokenHash = accessToken ? hashAuthorAccessToken(accessToken) : "";
  const tokenRecord = tokenHash ? await getAuthorByAccessTokenHash(tokenHash) : null;

  if (!tokenRecord) {
    redirect("/author/login?error=invalid");
  }

  await updateAuthorAccessTokenLastUsedAt(tokenRecord.id);
  await setAuthorSessionCookie(tokenRecord.authorId, tokenRecord.authorCode);

  redirect("/author");
}
