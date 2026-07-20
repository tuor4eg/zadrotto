"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { revokeAllAuthorSessions, revokeAuthorSessionById } from "@/db/queries/author-auth";
import { getAuthorAccountByAuthorId, updateAuthorAccountCredentials } from "@/db/queries/author-auth";
import { requestAuthorEmailChange } from "@/db/operations/author-auth";
import { clearAuthorSessionCookie, getCurrentAuthorSession } from "@/lib/auth/author-auth";
import { isValidAuthorEmail, isValidAuthorLogin, normalizeAuthorEmail, normalizeAuthorLogin, validateAuthorPassword } from "@/lib/auth/author-account";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity-logs/server";
import { isAuthorEmailDeliveryConfigured } from "@/lib/auth/features";

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function requireCurrentAccount() {
  const current = await getCurrentAuthorSession();
  if (!current) redirect("/author/login");
  const account = await getAuthorAccountByAuthorId(current.author.id);
  if (!account || account.status !== "active") redirect("/author/settings/security?error=unavailable");
  return { current, account };
}

export async function changeAuthorPasswordAction(formData: FormData) {
  const { current, account } = await requireCurrentAccount();
  const currentPassword = read(formData, "currentPassword");
  const password = read(formData, "password");
  if (!(await verifyPassword(currentPassword, account.passwordHash)) || !validateAuthorPassword(password).ok) {
    redirect("/author/settings/security?error=invalid");
  }
  await updateAuthorAccountCredentials({ authorId: current.author.id, passwordHash: await hashPassword(password) });
  await revokeAllAuthorSessions(current.author.id, current.session.sessionId);
  await logActivity({ action: "author.password.changed", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор изменил пароль." });
  redirect("/author/settings/security?updated=password");
}

export async function changeAuthorLoginAction(formData: FormData) {
  const { current, account } = await requireCurrentAccount();
  const password = read(formData, "currentPassword");
  const login = read(formData, "login");
  if (!isValidAuthorLogin(login) || !(await verifyPassword(password, account.passwordHash))) redirect("/author/settings/security?error=invalid");
  try {
    await updateAuthorAccountCredentials({ authorId: current.author.id, login, normalizedLogin: normalizeAuthorLogin(login) });
  } catch { redirect("/author/settings/security?error=unavailable"); }
  await logActivity({ action: "author.updated", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор изменил логин аккаунта.", metadata: { field: "login" } });
  redirect("/author/settings/security?updated=login");
}

export async function changeAuthorEmailAction(formData: FormData) {
  const { current, account } = await requireCurrentAccount();
  const password = read(formData, "currentPassword");
  const email = read(formData, "email");
  if (!(await isAuthorEmailDeliveryConfigured())) redirect("/author/settings/security?error=unavailable");
  if (!isValidAuthorEmail(email) || !(await verifyPassword(password, account.passwordHash))) redirect("/author/settings/security?error=invalid");
  try {
    await requestAuthorEmailChange({ authorId: current.author.id, email, normalizedEmail: normalizeAuthorEmail(email) });
  } catch { redirect("/author/settings/security?error=unavailable"); }
  await logActivity({ action: "author.email.changed", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор запросил смену email.", metadata: { stage: "requested" } });
  redirect("/author/settings/security?updated=email-pending");
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
  revalidatePath("/author/settings/security");
  await logActivity({ action: "author.session.revoked", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор завершил сессию.", metadata: { scope: intent } });
}
