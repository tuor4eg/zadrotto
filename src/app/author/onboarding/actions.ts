"use server";

import { redirect } from "next/navigation";

import { onboardExistingAuthor, resendAuthorEmailVerification } from "@/db/operations/author-auth";
import { getAuthorAccountByAuthorId } from "@/db/queries/author-auth";
import {
  getCurrentAuthorSession,
  isFreshAccessTokenSession,
} from "@/lib/auth/author-auth";
import {
  normalizeAuthorEmail,
  normalizeAuthorLogin,
  isValidAuthorEmail,
  isValidAuthorLogin,
  validateAuthorPassword,
} from "@/lib/auth/author-account";
import { hashPassword } from "@/lib/auth/password";
import { checkAuthorAuthMutationRateLimit } from "@/lib/auth/mutation-rate-limit";
import { logActivity } from "@/lib/activity-logs/server";
import { isAuthorEmailDeliveryConfigured } from "@/lib/auth/features";

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function onboardExistingAuthorAction(formData: FormData) {
  const current = await getCurrentAuthorSession();
  if (!current || !isFreshAccessTokenSession(current.session)) redirect("/author/login");
  if (!(await isAuthorEmailDeliveryConfigured())) redirect("/author/onboarding?error=email-unavailable");
  if (await getAuthorAccountByAuthorId(current.author.id)) redirect("/author");

  const login = read(formData, "login");
  const email = read(formData, "email");
  const password = read(formData, "password");
  const confirmation = read(formData, "passwordConfirmation");
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-onboarding", String(current.author.id));
  if (!rateLimit.ok) redirect("/author/onboarding?error=unavailable");
  if (!isValidAuthorLogin(login) || !isValidAuthorEmail(email) || password !== confirmation || !validateAuthorPassword(password).ok) {
    redirect("/author/onboarding?error=invalid");
  }

  try {
    await onboardExistingAuthor({
      authorId: current.author.id,
      login,
      normalizedLogin: normalizeAuthorLogin(login),
      passwordHash: await hashPassword(password),
      email,
      normalizedEmail: normalizeAuthorEmail(email),
    });
    await logActivity({
      action: "author.registration.submitted",
      actorType: "author",
      authorId: current.author.id,
      entityType: "author-account",
      entityId: current.author.id,
      message: "Автор настроил вход и запросил подтверждение email.",
      metadata: { source: "access-token-onboarding" },
    });
  } catch {
    redirect("/author/onboarding?error=unavailable");
  }
  redirect("/author/onboarding?sent=1");
}

export async function resendAuthorVerificationAction() {
  const current = await getCurrentAuthorSession();
  if (!current || !isFreshAccessTokenSession(current.session)) redirect("/author/login");
  if (!(await isAuthorEmailDeliveryConfigured())) redirect("/author/onboarding?sent=1&resendError=1");
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-verify", String(current.author.id));
  if (!rateLimit.ok) redirect("/author/onboarding?sent=1&resendError=1");
  try {
    await resendAuthorEmailVerification(current.author.id);
  } catch {
    redirect("/author/onboarding?sent=1&resendError=1");
  }
  redirect("/author/onboarding?sent=1&resent=1");
}
