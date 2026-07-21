"use server";

import { redirect } from "next/navigation";
import { getResendEmailConfig, saveResendEmailConfig, setEmailDeliveryEnabled } from "@/db/queries/email-provider";
import type { CreateActivityLogInput } from "@/db/queries/activity-logs";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { validateResendEmailConfig } from "@/lib/auth/email-provider";
import { sendEmailWithResend } from "@/lib/auth/resend";
import { logActivity, prepareActivityLog } from "@/lib/activity-logs/server";

const PROVIDER_PATH = "/admin/tools/email/provider";
function read(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }

export async function saveEmailProviderAction(formData: FormData) {
  const admin = await requireAdminUser();
  const current = await getResendEmailConfig();
  const parsed = validateResendEmailConfig({ apiKey: read(formData, "apiKey") || current?.apiKey || "", fromName: read(formData, "fromName"), fromEmail: read(formData, "fromEmail"), replyTo: read(formData, "replyTo") || undefined, enabled: formData.get("enabled") === "1" });
  if (!parsed) {
    await logActivity({ action: "email-provider.saved", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", status: "failure", message: "Настройки email-провайдера не прошли проверку.", metadata: { provider: "resend", reason: "invalid-config" } });
    redirect(`${PROVIDER_PATH}?error=invalid`);
  }
  const activityLogs: [CreateActivityLogInput, ...CreateActivityLogInput[]] = [await prepareActivityLog({ action: "email-provider.saved", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", message: "Настройки email-провайдера сохранены.", metadata: { enabled: parsed.enabled, replacedApiKey: Boolean(read(formData, "apiKey")), provider: "resend" } })];
  if (current?.enabled !== parsed.enabled) activityLogs.push(await prepareActivityLog({ action: parsed.enabled ? "email-provider.enabled" : "email-provider.disabled", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", message: parsed.enabled ? "Email-провайдер включён." : "Email-провайдер выключен.", metadata: { provider: "resend" } }));
  const saved = await saveResendEmailConfig({ adminId: admin.id, ...parsed, activityLogs });
  if (!saved) await logActivity({ action: "email-provider.saved", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", status: "failure", message: "Не удалось сохранить настройки email-провайдера.", metadata: { provider: "resend", reason: "encryption" } });
  redirect(saved ? `${PROVIDER_PATH}?saved=1` : `${PROVIDER_PATH}?error=encryption`);
}

export async function disableEmailProviderAction() {
  const admin = await requireAdminUser();
  const activityLog = await prepareActivityLog({ action: "email-provider.disabled", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", message: "Email-провайдер выключен.", metadata: { provider: "resend" } });
  const disabled = await setEmailDeliveryEnabled({ enabled: false, adminId: admin.id, activityLog });
  if (!disabled) await logActivity({ action: "email-provider.disabled", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", status: "failure", message: "Не удалось выключить email-провайдер.", metadata: { provider: "resend" } });
  redirect(disabled ? `${PROVIDER_PATH}?saved=1` : `${PROVIDER_PATH}?error=missing`);
}

export async function testEmailProviderAction() {
  const admin = await requireAdminUser();
  const config = await getResendEmailConfig();
  if (!config) { await logActivity({ action: "email-provider.tested", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", status: "failure", message: "Тест email недоступен: провайдер не настроен.", metadata: { provider: "resend", reason: "unavailable-config" } }); redirect(`${PROVIDER_PATH}?error=unavailable`); }
  const result = await sendEmailWithResend({
    config,
    idempotencyKey: `author-email-test-${Date.now()}`,
    recipient: config.fromEmail,
    subject: "Проверка доставки email",
    text: "Тестовое письмо: доставка системных сообщений настроена.",
    html: "<p>Тестовое письмо: доставка системных сообщений настроена.</p>",
  });
  await logActivity({ action: "email-provider.tested", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", status: result.ok ? "success" : "failure", message: result.ok ? "Тестовое email отправлено." : "Тест email завершился ошибкой.", metadata: { provider: "resend", retryable: result.ok ? false : result.retryable } });
  redirect(result.ok ? `${PROVIDER_PATH}?tested=1` : `${PROVIDER_PATH}?error=test`);
}
