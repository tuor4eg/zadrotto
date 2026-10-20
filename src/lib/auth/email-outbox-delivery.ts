import {
  claimPendingEmailOutboxMessages,
  updateEmailOutboxStatus,
  validateEmailOutboxLease,
} from "@/db/queries/email-outbox";
import { decryptEmailOutboxPayload } from "@/lib/auth/email-outbox-crypto";
import { getResendEmailDeliveryReadiness } from "@/db/queries/email-provider";
import { renderAuthorEmail } from "@/lib/auth/email-templates";
import { sendEmailWithResend } from "@/lib/auth/resend";
import { calculateEmailRetryDelaySeconds, sanitizeEmailDeliveryError, type EmailAutomationSettingsInput } from "@/lib/auth/email-automation";

const deliveryDependencies = {
  getResendEmailDeliveryReadiness, claimPendingEmailOutboxMessages, validateEmailOutboxLease,
  updateEmailOutboxStatus, decryptEmailOutboxPayload, renderAuthorEmail, sendEmailWithResend,
};

export async function deliverPendingAuthorEmails(
  settings: Pick<EmailAutomationSettingsInput, "deliveryBatchSize" | "deliveryMaxAttempts" | "retryBaseSeconds" | "retryMaxSeconds">,
  signal?: AbortSignal,
  dependencies: Partial<typeof deliveryDependencies> = {},
) {
  const { getResendEmailDeliveryReadiness, claimPendingEmailOutboxMessages, validateEmailOutboxLease,
    updateEmailOutboxStatus, decryptEmailOutboxPayload, renderAuthorEmail, sendEmailWithResend } = { ...deliveryDependencies, ...dependencies };
  signal?.throwIfAborted();
  const readiness = await getResendEmailDeliveryReadiness();
  if (!readiness) return { ok: false as const, reason: "unavailable" as const };
  const { config, siteOrigin } = readiness;

  signal?.throwIfAborted();
  const messages = await claimPendingEmailOutboxMessages(settings.deliveryBatchSize, settings.deliveryMaxAttempts);
  let delivered = 0;
  for (const message of messages) {
    signal?.throwIfAborted();
    if (!message.leaseToken) continue;
    try {
      const rendered = renderAuthorEmail({
        template: message.template as Parameters<typeof renderAuthorEmail>[0]["template"],
        payload: decryptEmailOutboxPayload(message.encryptedPayload),
        siteUrl: siteOrigin.href,
      });
      signal?.throwIfAborted();
      if (!await validateEmailOutboxLease(message.id, message.leaseToken)) continue;
      signal?.throwIfAborted();
      const result = await sendEmailWithResend({
        signal,
        config,
        idempotencyKey: `author-email-outbox-${message.id}`,
        recipient: message.recipient,
        ...rendered,
      });
      signal?.throwIfAborted();
      if (!result.ok) {
        const attempts = message.attempts;
        await updateEmailOutboxStatus({
          id: message.id,
          leaseToken: message.leaseToken,
          status: !result.retryable || attempts >= settings.deliveryMaxAttempts ? "failed" : "pending",
          nextAttemptAt: new Date(Date.now() + calculateEmailRetryDelaySeconds({ attempts, baseSeconds: settings.retryBaseSeconds, maxSeconds: settings.retryMaxSeconds }) * 1000),
          lastError: sanitizeEmailDeliveryError(result.error),
        });
        continue;
      }
      const committed = await updateEmailOutboxStatus({
        id: message.id,
        leaseToken: message.leaseToken,
        status: "sent",
        sentAt: new Date(),
        lastError: null,
      });
      if (committed) delivered += 1;
    } catch (error) {
      signal?.throwIfAborted();
      const attempts = message.attempts;
      await updateEmailOutboxStatus({
        id: message.id,
        leaseToken: message.leaseToken,
        status: attempts >= settings.deliveryMaxAttempts ? "failed" : "pending",
        nextAttemptAt: new Date(Date.now() + calculateEmailRetryDelaySeconds({ attempts, baseSeconds: settings.retryBaseSeconds, maxSeconds: settings.retryMaxSeconds }) * 1000),
        lastError: sanitizeEmailDeliveryError(error),
      });
    }
  }
  return { ok: true as const, delivered, processed: messages.length };
}
