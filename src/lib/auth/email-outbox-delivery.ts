import {
  claimPendingEmailOutboxMessages,
  updateEmailOutboxStatus,
} from "@/db/queries/email-outbox";
import { decryptEmailOutboxPayload } from "@/lib/auth/email-outbox-crypto";
import { getResendEmailDeliveryReadiness } from "@/db/queries/email-provider";
import { renderAuthorEmail } from "@/lib/auth/email-templates";
import { sendEmailWithResend } from "@/lib/auth/resend";

export async function deliverPendingAuthorEmails(limit = 10) {
  const readiness = await getResendEmailDeliveryReadiness();
  if (!readiness) return { ok: false as const, reason: "unavailable" as const };
  const { config, siteOrigin } = readiness;

  const messages = await claimPendingEmailOutboxMessages(limit);
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
          status: !result.retryable || attempts >= 5 ? "failed" : "pending",
          attempts,
          nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60 * 1000),
          lastError: result.error.slice(0, 500),
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
        status: attempts >= 5 ? "failed" : "pending",
        attempts,
        nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60 * 1000),
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery error",
      });
    }
  }
  return { ok: true as const, delivered, processed: messages.length };
}
