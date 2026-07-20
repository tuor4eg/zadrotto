"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getResendEmailConfig, retryFailedEmailOutbox, saveResendEmailConfig, setEmailDeliveryEnabled } from "@/db/queries/email-provider";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { validateResendEmailConfig } from "@/lib/auth/email-provider";
import { renderAuthorEmail } from "@/lib/auth/email-templates";
import { sendEmailWithResend } from "@/lib/auth/resend";
import { logActivity } from "@/lib/activity-logs/server";
import { getSiteOrigin } from "@/lib/site-url";

function read(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }

export async function saveEmailProviderAction(formData: FormData) {
  const admin = await requireAdminUser();
  const current = await getResendEmailConfig();
  const parsed = validateResendEmailConfig({
    apiKey: read(formData, "apiKey") || current?.apiKey || "",
    fromName: read(formData, "fromName"),
    fromEmail: read(formData, "fromEmail"),
    replyTo: read(formData, "replyTo") || undefined,
    enabled: formData.get("enabled") === "1",
  });
  if (!parsed) {
    await logActivity({
      action: "email-provider.saved", actorType: "admin", adminUserId: admin.id,
      entityType: "email-provider", entityLabel: "Resend", status: "failure",
      message: "Настройки email-провайдера не прошли проверку.",
      metadata: { provider: "resend", reason: "invalid-config" },
    });
    redirect("/admin/tools/email?error=invalid");
  }
  const saved = await saveResendEmailConfig({
    adminId: admin.id,
    ...parsed,
  });
  await logActivity({
    action: "email-provider.saved", actorType: "admin", adminUserId: admin.id,
    entityType: "email-provider", entityLabel: "Resend", status: saved ? "success" : "failure",
    message: saved ? "Настройки email-провайдера сохранены." : "Не удалось сохранить настройки email-провайдера.",
    metadata: { enabled: parsed.enabled, replacedApiKey: Boolean(read(formData, "apiKey")), provider: "resend" },
  });
  if (saved && current?.enabled !== parsed.enabled) {
    await logActivity({
      action: parsed.enabled ? "email-provider.enabled" : "email-provider.disabled",
      actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend",
      message: parsed.enabled ? "Email-провайдер включён." : "Email-провайдер выключен.",
      metadata: { provider: "resend" },
    });
  }
  redirect(saved ? "/admin/tools/email?saved=1" : "/admin/tools/email?error=encryption");
}

export async function disableEmailProviderAction() {
  const admin = await requireAdminUser();
  const disabled = await setEmailDeliveryEnabled(false, admin.id);
  await logActivity({ action: "email-provider.disabled", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", status: disabled ? "success" : "failure", message: disabled ? "Email-провайдер выключен." : "Не удалось выключить email-провайдер.", metadata: { provider: "resend" } });
  redirect(disabled ? "/admin/tools/email?saved=1" : "/admin/tools/email?error=missing");
}

export async function testEmailProviderAction() {
  const admin = await requireAdminUser();
  const config = await getResendEmailConfig();
  if (!config) {
    await logActivity({
      action: "email-provider.tested", actorType: "admin", adminUserId: admin.id,
      entityType: "email-provider", entityLabel: "Resend", status: "failure",
      message: "Тест email недоступен: провайдер не настроен или ключ не удалось расшифровать.",
      metadata: { provider: "resend", reason: "unavailable-config" },
    });
    redirect("/admin/tools/email?error=unavailable");
  }
  let siteOrigin;
  try {
    siteOrigin = getSiteOrigin();
  } catch {
    await logActivity({
      action: "email-provider.tested", actorType: "admin", adminUserId: admin.id,
      entityType: "email-provider", entityLabel: "Resend", status: "failure",
      message: "Тест email недоступен: SITE_URL не задан или имеет неверный формат.",
      metadata: { provider: "resend", reason: "invalid-site-url" },
    });
    redirect("/admin/tools/email?error=site-url");
  }
  const rendered = renderAuthorEmail({ template: "registration_approved", payload: {}, siteUrl: siteOrigin.href });
  const result = await sendEmailWithResend({ config, idempotencyKey: `author-email-test-${Date.now()}`, recipient: config.fromEmail, ...rendered });
  await logActivity({ action: "email-provider.tested", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", status: result.ok ? "success" : "failure", message: result.ok ? "Тестовое email отправлено." : "Тест email завершился ошибкой.", metadata: { provider: "resend", retryable: result.ok ? false : result.retryable } });
  redirect(result.ok ? "/admin/tools/email?tested=1" : "/admin/tools/email?error=test");
}

export async function retryFailedEmailsAction() {
  const admin = await requireAdminUser();
  const count = await retryFailedEmailOutbox();
  await logActivity({ action: "email-provider.retry-requested", actorType: "admin", adminUserId: admin.id, entityType: "email-provider", entityLabel: "Resend", message: "Ошибочные email возвращены в очередь.", metadata: { count, provider: "resend" } });
  revalidatePath("/admin/tools/email");
  redirect(`/admin/tools/email?retried=${count}`);
}
