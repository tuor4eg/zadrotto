"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { onboardExistingAuthor, requestAuthorEmailChange, resendAuthorEmailVerification } from "@/db/operations/author-auth";
import { getAuthorAccountByAuthorId, getAuthorCredentialConflicts, revokeAllAuthorSessions, revokeAuthorSessionById, updateAuthorAccountCredentials } from "@/db/queries/author-auth";
import { clearAuthorSessionCookie, getCurrentAuthorSession } from "@/lib/auth/author-auth";
import { isValidAuthorEmail, isValidAuthorLogin, normalizeAuthorEmail, normalizeAuthorLogin, validateAuthorPassword } from "@/lib/auth/author-account";
import {
  isAuthorEmailDeliveryConfigured,
  isAuthorEmailVerificationBypassed,
} from "@/lib/auth/features";
import { checkAuthorAuthMutationRateLimit } from "@/lib/auth/mutation-rate-limit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity-logs/server";
import { getUniqueViolationConstraint } from "@/lib/common/app-error-messages";
import {
  deleteAuthorAvatarBestEffort,
  parseAvatarCrop,
  uploadAuthorAvatar,
} from "@/lib/avatars/storage";
import { replaceAuthorAvatarObjectKey, updateAuthorDisplayName } from "@/db/queries/authors";
import { normalizeAuthorDisplayName } from "@/lib/authors/display-name";

const PROFILE_PATH = "/author/profile";
const SESSIONS_PATH = "/author/profile/sessions";

export async function logoutAuthorToTokenLogin() {
  await clearAuthorSessionCookie();
  redirect("/author/token");
}

export async function updateAuthorAvatarAction(formData: FormData) {
  const current = await getCurrentAuthorSession();
  if (!current) redirect("/author/login");

  const file = formData.get("avatarFile");
  const crop = parseAvatarCrop({
    x: formData.get("cropX"),
    y: formData.get("cropY"),
    width: formData.get("cropWidth"),
    height: formData.get("cropHeight"),
  });
  if (!(file instanceof File) || !crop) redirect(`${PROFILE_PATH}?avatarError=invalid`);

  const uploaded = await uploadAuthorAvatar({
    authorId: current.author.id,
    file,
    crop,
  });
  if (!uploaded.ok) redirect(`${PROFILE_PATH}?avatarError=${uploaded.error}`);

  let replaced;
  try {
    replaced = await replaceAuthorAvatarObjectKey({
      authorId: current.author.id,
      objectKey: uploaded.objectKey,
    });
  } catch (error) {
    await deleteAuthorAvatarBestEffort(uploaded.objectKey);
    console.error(error);
    redirect(`${PROFILE_PATH}?avatarError=avatar-upload`);
  }
  if (!replaced) {
    await deleteAuthorAvatarBestEffort(uploaded.objectKey);
    redirect(`${PROFILE_PATH}?avatarError=avatar-upload`);
  }

  await deleteAuthorAvatarBestEffort(replaced.previousObjectKey);
  revalidatePath("/", "layout");
  await logActivity({
    action: "author.avatar.updated",
    actorType: "author",
    authorId: current.author.id,
    entityType: "author",
    entityId: current.author.id,
    entityLabel: current.author.name,
    message: "Автор обновил аватар.",
  });
  redirect(`${PROFILE_PATH}?avatarUpdated=1`);
}

export async function removeAuthorAvatarAction() {
  const current = await getCurrentAuthorSession();
  if (!current) redirect("/author/login");

  const replaced = await replaceAuthorAvatarObjectKey({
    authorId: current.author.id,
    objectKey: null,
  });
  if (!replaced) redirect(`${PROFILE_PATH}?avatarError=avatar-upload`);

  await deleteAuthorAvatarBestEffort(replaced.previousObjectKey);
  revalidatePath("/", "layout");
  await logActivity({
    action: "author.avatar.removed",
    actorType: "author",
    authorId: current.author.id,
    entityType: "author",
    entityId: current.author.id,
    entityLabel: current.author.name,
    message: "Автор удалил аватар.",
  });
  redirect(`${PROFILE_PATH}?avatarRemoved=1`);
}

export async function updateAuthorDisplayNameAction(formData: FormData) {
  const current = await getCurrentAuthorSession();
  if (!current) redirect("/author/login");

  const value = formData.get("displayName");
  const name = normalizeAuthorDisplayName(typeof value === "string" ? value : "");
  if (!name) redirect(`${PROFILE_PATH}?displayNameError=invalid`);

  const author = await updateAuthorDisplayName(current.author.id, name);
  if (!author) redirect(`${PROFILE_PATH}?displayNameError=unavailable`);

  revalidatePath("/", "layout");
  revalidatePath("/admin/authors");
  revalidatePath(`/admin/authors/${current.author.id}`);
  revalidatePath(`/admin/authors/${current.author.id}/edit`);
  await logActivity({
    action: "author.display-name.updated",
    actorType: "author",
    authorId: current.author.id,
    entityType: "author",
    entityId: current.author.id,
    entityLabel: name,
    message: "Автор изменил отображаемое имя.",
  });
  redirect(`${PROFILE_PATH}?displayNameUpdated=1`);
}

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

export type AuthorOnboardingState = {
  error: "credentials-taken" | "email-taken" | "invalid" | "login-taken" | "unavailable";
} | null;

export async function onboardExistingAuthorAction(
  _previousState: AuthorOnboardingState,
  formData: FormData,
): Promise<AuthorOnboardingState> {
  const current = await requireAccessTokenSession();
  const bypassEmailVerification = isAuthorEmailVerificationBypassed();
  if (!bypassEmailVerification && !(await isAuthorEmailDeliveryConfigured())) {
    return { error: "unavailable" };
  }
  if (await getAuthorAccountByAuthorId(current.author.id)) redirect(PROFILE_PATH);
  const login = read(formData, "login");
  const email = read(formData, "email");
  const password = readPassword(formData, "password");
  const confirmation = readPassword(formData, "passwordConfirmation");
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-onboarding", String(current.author.id));
  if (!rateLimit.ok) return { error: "unavailable" };
  if (!isValidAuthorLogin(login) || !isValidAuthorEmail(email) || password !== confirmation || !validateAuthorPassword(password).ok) {
    return { error: "invalid" };
  }
  const normalizedLogin = normalizeAuthorLogin(login);
  const normalizedEmail = normalizeAuthorEmail(email);
  const conflicts = await getAuthorCredentialConflicts({ normalizedLogin, normalizedEmail });
  if (conflicts.loginTaken && conflicts.emailTaken) return { error: "credentials-taken" };
  if (conflicts.loginTaken) return { error: "login-taken" };
  if (conflicts.emailTaken) return { error: "email-taken" };
  try {
    await onboardExistingAuthor({ authorId: current.author.id, login, normalizedLogin, passwordHash: await hashPassword(password), email, normalizedEmail });
    await logActivity({
      action: "author.registration.submitted",
      actorType: "author",
      authorId: current.author.id,
      entityType: "author-account",
      entityId: current.author.id,
      message: bypassEmailVerification
        ? "Автор настроил вход без подтверждения email."
        : "Автор настроил вход и запросил подтверждение email.",
      metadata: {
        source: "access-token-profile",
        emailVerificationBypassed: bypassEmailVerification,
      },
    });
  } catch (error) {
    const constraint = getUniqueViolationConstraint(error);
    if (constraint === "author_accounts_normalized_login_unique") {
      return { error: "login-taken" };
    }
    if (constraint === "author_emails_normalized_email_unique") {
      return { error: "email-taken" };
    }
    return { error: "unavailable" };
  }
  redirect(bypassEmailVerification
    ? `${PROFILE_PATH}?updated=credentials`
    : `${PROFILE_PATH}?sent=1`);
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
  revalidatePath(SESSIONS_PATH);
  await logActivity({ action: "author.session.revoked", actorType: "author", authorId: current.author.id, entityType: "author-account", entityId: current.author.id, message: "Автор завершил сессию.", metadata: { scope: intent } });
}
