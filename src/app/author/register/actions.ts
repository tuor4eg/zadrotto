"use server";

import { redirect } from "next/navigation";

import { registerAuthorAccount } from "@/db/operations/author-auth";
import { isValidAuthorEmail, isValidAuthorLogin, normalizeAuthorEmail, normalizeAuthorLogin, validateAuthorPassword } from "@/lib/auth/author-account";
import { isAuthorEmailDeliveryConfigured, isAuthorRegistrationEnabled } from "@/lib/auth/features";
import { checkAuthorAuthMutationRateLimit } from "@/lib/auth/mutation-rate-limit";
import { hashPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity-logs/server";

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function registerAuthorAction(formData: FormData) {
  if (!isAuthorRegistrationEnabled() || !(await isAuthorEmailDeliveryConfigured())) redirect("/author/login");
  const name = read(formData, "name");
  const login = read(formData, "login");
  const email = read(formData, "email");
  const password = read(formData, "password");
  const confirmation = read(formData, "passwordConfirmation");
  const honeypot = read(formData, "website");
  const formStartedAt = Number(read(formData, "formStartedAt"));
  const fillTime = Date.now() - formStartedAt;
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-register", normalizeAuthorEmail(email));
  if (!rateLimit.ok) redirect("/author/register?error=unavailable");
  if (honeypot || !Number.isFinite(formStartedAt) || fillTime < 1500 || fillTime > 60 * 60 * 1000
    || !name || !isValidAuthorLogin(login) || !isValidAuthorEmail(email)
    || password !== confirmation || !validateAuthorPassword(password).ok) {
    redirect("/author/register?error=invalid");
  }
  try {
    const author = await registerAuthorAccount({
      name,
      login,
      normalizedLogin: normalizeAuthorLogin(login),
      passwordHash: await hashPassword(password),
      email,
      normalizedEmail: normalizeAuthorEmail(email),
    });
    await logActivity({
      action: "author.registration.submitted",
      actorType: "author",
      authorId: author.id,
      entityType: "author-account",
      entityId: author.id,
      message: "Отправлена заявка на регистрацию автора.",
      metadata: { source: "public-registration" },
    });
  } catch {
    // The same response covers uniqueness and infrastructure failures.
  }
  redirect("/author/register?sent=1");
}
