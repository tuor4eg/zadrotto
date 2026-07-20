"use server";

import { redirect } from "next/navigation";

import { resetAuthorPassword } from "@/db/operations/author-auth";
import { validateAuthorPassword } from "@/lib/auth/author-account";
import { hashAuthorAuthChallengeToken } from "@/lib/auth/challenges";
import { hashPassword } from "@/lib/auth/password";
import { checkAuthorAuthMutationRateLimit } from "@/lib/auth/mutation-rate-limit";

export async function resetAuthorPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-reset", token);
  if (!rateLimit.ok) redirect("/author/login?resetError=1");
  if (!token || !validateAuthorPassword(password).ok) redirect("/author/login?resetError=1");
  const ok = await resetAuthorPassword({ tokenHash: hashAuthorAuthChallengeToken(token), passwordHash: await hashPassword(password) });
  redirect(ok ? "/author/login?reset=1" : "/author/login?resetError=1");
}
