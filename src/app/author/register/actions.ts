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

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function registerAuthorAction(formData: FormData) {
  const bypassEmailVerification = isAuthorEmailVerificationBypassed();
  if (
    !isAuthorRegistrationEnabled()
    || (!bypassEmailVerification && !(await isAuthorEmailDeliveryConfigured()))
  ) redirect("/author/login");
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
  } catch {
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
    } catch {
      // The same response covers credential conflicts and infrastructure failures.
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
