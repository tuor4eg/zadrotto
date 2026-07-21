"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { onboardExistingAuthor, requestAuthorEmailChange, resendAuthorEmailVerification } from "@/db/operations/author-auth";
import { getAuthorAccountByAuthorId, revokeAllAuthorSessions, revokeAuthorSessionById, updateAuthorAccountCredentials } from "@/db/queries/author-auth";
import { clearAuthorSessionCookie, getCurrentAuthorSession } from "@/lib/auth/author-auth";
import { isValidAuthorEmail, isValidAuthorLogin, normalizeAuthorEmail, normalizeAuthorLogin, validateAuthorPassword } from "@/lib/auth/author-account";
import { isAuthorEmailDeliveryConfigured } from "@/lib/auth/features";
import { checkAuthorAuthMutationRateLimit } from "@/lib/auth/mutation-rate-limit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity-logs/server";

const PROFILE_PATH = "/author/profile";

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readPassword(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function requireAccessTokenSession() {
  const current = await getCurrentAuthorSession();
  if (!current) redirect("/author/login");
  if (current.session.authMethod !== "access_token") redirect(`${PROFILE_PATH}?error=token-required`);
  return current;
}

async function requireActiveAccount() {
  const current = await getCurrentAuthorSession();
  if (!current) redirect("/author/login");
  const account = await getAuthorAccountByAuthorId(current.author.id);
  if (!account || account.status !== "active") redirect(`${PROFILE_PATH}?error=unavailable`);
  return { current, account };
}

export async function onboardExistingAuthorAction(formData: FormData) {
  const current = await requireAccessTokenSession();
  if (!(await isAuthorEmailDeliveryConfigured())) redirect(`${PROFILE_PATH}?error=email-unavailable`);
  if (await getAuthorAccountByAuthorId(current.author.id)) redirect(PROFILE_PATH);
  const login = read(formData, "login");
  const email = read(formData, "email");
  const password = readPassword(formData, "password");
  const confirmation = readPassword(formData, "passwordConfirmation");
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-onboarding", String(current.author.id));
  if (!rateLimit.ok) redirect(`${PROFILE_PATH}?error=unavailable`);
  if (!isValidAuthorLogin(login) || !isValidAuthorEmail(email) || password !== confirmation || !validateAuthorPassword(password).ok) redirect(`${PROFILE_PATH}?error=invalid`);
  try {
    await onboardExistingAuthor({ authorId: current.author.id, login, normalizedLogin: normalizeAuthorLogin(login), passwordHash: await hashPassword(password), email, normalizedEmail: normalizeAuthorEmail(email) });
    await logActivity({ action: "author.registration.submitted", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор настроил вход и запросил подтверждение email.", metadata: { source: "access-token-profile" } });
  } catch {
    redirect(`${PROFILE_PATH}?error=unavailable`);
  }
  redirect(`${PROFILE_PATH}?sent=1`);
}

export async function resendAuthorVerificationAction() {
  const current = await requireAccessTokenSession();
  if (!(await isAuthorEmailDeliveryConfigured())) redirect(`${PROFILE_PATH}?resendError=1`);
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-verify", String(current.author.id));
  if (!rateLimit.ok) redirect(`${PROFILE_PATH}?resendError=1`);
  try {
    if (!(await resendAuthorEmailVerification(current.author.id))) redirect(`${PROFILE_PATH}?resendError=1`);
  } catch {
    redirect(`${PROFILE_PATH}?resendError=1`);
  }
  redirect(`${PROFILE_PATH}?resent=1`);
}

export async function changeAuthorPasswordAction(formData: FormData) {
  const { current, account } = await requireActiveAccount();
  const currentPassword = readPassword(formData, "currentPassword");
  const password = readPassword(formData, "password");
  if (!(await verifyPassword(currentPassword, account.passwordHash)) || !validateAuthorPassword(password).ok) redirect(`${PROFILE_PATH}?error=invalid`);
  await updateAuthorAccountCredentials({ authorId: current.author.id, passwordHash: await hashPassword(password) });
  await revokeAllAuthorSessions(current.author.id, current.session.sessionId);
  await logActivity({ action: "author.password.changed", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор изменил пароль." });
  redirect(`${PROFILE_PATH}?updated=password`);
}

export async function changeAuthorEmailAction(formData: FormData) {
  const { current, account } = await requireActiveAccount();
  const password = readPassword(formData, "currentPassword");
  const email = read(formData, "email");
  if (!(await isAuthorEmailDeliveryConfigured())) redirect(`${PROFILE_PATH}?error=unavailable`);
  if (!isValidAuthorEmail(email) || !(await verifyPassword(password, account.passwordHash))) redirect(`${PROFILE_PATH}?error=invalid`);
  try {
    await requestAuthorEmailChange({ authorId: current.author.id, email, normalizedEmail: normalizeAuthorEmail(email) });
  } catch {
    redirect(`${PROFILE_PATH}?error=unavailable`);
  }
  await logActivity({ action: "author.email.changed", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор запросил смену email.", metadata: { stage: "requested" } });
  redirect(`${PROFILE_PATH}?updated=email-pending`);
}

export async function revokeAuthorSessionAction(formData: FormData) {
  const current = await getCurrentAuthorSession();
  if (!current) redirect("/author/login");
  const intent = String(formData.get("intent") ?? "one");
  if (intent === "all") {
    await revokeAllAuthorSessions(current.author.id);
    await logActivity({ action: "author.session.revoked", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор завершил все сессии.", metadata: { scope: "all" } });
    await clearAuthorSessionCookie();
    redirect("/author/login");
  }
  if (intent === "others") {
    await revokeAllAuthorSessions(current.author.id, current.session.sessionId);
  } else {
    const sessionId = Number(formData.get("sessionId"));
    if (Number.isInteger(sessionId) && sessionId > 0) {
      await revokeAuthorSessionById(current.author.id, sessionId);
      if (sessionId === current.session.sessionId) {
        await logActivity({ action: "author.session.revoked", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор завершил текущую сессию.", metadata: { scope: "current" } });
        await clearAuthorSessionCookie();
        redirect("/author/login");
      }
    }
  }
  revalidatePath(PROFILE_PATH);
  await logActivity({ action: "author.session.revoked", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор завершил сессию.", metadata: { scope: intent } });
}
