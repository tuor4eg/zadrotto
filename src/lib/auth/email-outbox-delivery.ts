import {
  claimPendingEmailOutboxMessages,
  updateEmailOutboxStatus,
} from "@/db/queries/email-outbox";
import { decryptEmailOutboxPayload } from "@/lib/auth/email-outbox-crypto";
import { getResendEmailDeliveryReadiness } from "@/db/queries/email-provider";
import { renderAuthorEmail } from "@/lib/auth/email-templates";
import { sendEmailWithResend } from "@/lib/auth/resend";
import { calculateEmailRetryDelaySeconds, sanitizeEmailDeliveryError, type EmailAutomationSettingsInput } from "@/lib/auth/email-automation";

export async function deliverPendingAuthorEmails(settings: Pick<EmailAutomationSettingsInput, "deliveryBatchSize" | "deliveryMaxAttempts" | "retryBaseSeconds" | "retryMaxSeconds">) {
  const readiness = await getResendEmailDeliveryReadiness();
  if (!readiness) return { ok: false as const, reason: "unavailable" as const };
  const { config, siteOrigin } = readiness;

  const messages = await claimPendingEmailOutboxMessages(settings.deliveryBatchSize, settings.deliveryMaxAttempts);
  let delivered = 0;
  for (const message of messages) {
    try {
      const rendered = renderAuthorEmail({
        template: message.template as Parameters<typeof renderAuthorEmail>[0]["template"],
        payload: decryptEmailOutboxPayload(message.encryptedPayload),
        siteUrl: siteOrigin.href,
      });
      const result = await sendEmailWithResend({
        config,
        idempotencyKey: `author-email-outbox-${message.id}`,
        recipient: message.recipient,
        ...rendered,
      });
      if (!result.ok) {
        const attempts = message.attempts + 1;
        await updateEmailOutboxStatus({
          id: message.id,
          status: !result.retryable || attempts >= settings.deliveryMaxAttempts ? "failed" : "pending",
          attempts,
          nextAttemptAt: new Date(Date.now() + calculateEmailRetryDelaySeconds({ attempts, baseSeconds: settings.retryBaseSeconds, maxSeconds: settings.retryMaxSeconds }) * 1000),
          lastError: sanitizeEmailDeliveryError(result.error),
        });
        continue;
      }
      await updateEmailOutboxStatus({
        id: message.id,
        status: "sent",
        attempts: message.attempts + 1,
        sentAt: new Date(),
        lastError: null,
      });
      delivered += 1;
    } catch (error) {
      const attempts = message.attempts + 1;
      await updateEmailOutboxStatus({
        id: message.id,
        status: attempts >= settings.deliveryMaxAttempts ? "failed" : "pending",
        attempts,
        nextAttemptAt: new Date(Date.now() + calculateEmailRetryDelaySeconds({ attempts, baseSeconds: settings.retryBaseSeconds, maxSeconds: settings.retryMaxSeconds }) * 1000),
        lastError: sanitizeEmailDeliveryError(error),
      });
    }
  }
  return { ok: true as const, delivered, processed: messages.length };
}
