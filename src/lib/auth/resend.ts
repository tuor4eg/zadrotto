import type { ResendEmailConfig } from "@/lib/auth/email-provider";

export type ResendSendResult =
  | { ok: true }
  | { ok: false; retryable: boolean; error: string };

export async function sendEmailWithResend(input: {
  config: ResendEmailConfig;
  idempotencyKey: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
}): Promise<ResendSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
        "User-Agent": "zadrotto-author-email/1.0",
      },
      body: JSON.stringify({
        from: `${input.config.fromName} <${input.config.fromEmail}>`,
        to: [input.recipient],
        reply_to: input.config.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (response.ok) return { ok: true };
    return { ok: false, retryable: response.status === 429 || response.status >= 500, error: `Resend HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, retryable: true, error: error instanceof Error ? error.message : "Resend request failed" };
  } finally {
    clearTimeout(timeout);
  }
}
