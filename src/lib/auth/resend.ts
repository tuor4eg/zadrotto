import { createHash } from "node:crypto";

import type { ResendEmailConfig } from "@/lib/auth/email-provider";

export type ResendSendResult =
  | { ok: true }
  | { ok: false; retryable: boolean; error: string };

const RESEND_ERROR_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

function getResendErrorIdentifier(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object"
    ? record.error as Record<string, unknown>
    : null;
  for (const source of [record, nested]) {
    if (!source) continue;
    for (const key of ["name", "code", "type"] as const) {
      const identifier = source[key];
      if (typeof identifier === "string" && RESEND_ERROR_IDENTIFIER_PATTERN.test(identifier)) {
        return identifier.toLowerCase();
      }
    }
  }
  return null;
}

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
  const requestBody = JSON.stringify({
    from: `${input.config.fromName} <${input.config.fromEmail}>`,
    to: [input.recipient],
    reply_to: input.config.replyTo,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  const payloadHash = createHash("sha256").update(requestBody).digest("hex").slice(0, 16);
  const idempotencyKey = `${input.idempotencyKey.slice(0, 239)}-${payloadHash}`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "User-Agent": "zadrotto-author-email/1.0",
      },
      body: requestBody,
    });
    if (response.ok) return { ok: true };
    const errorBody = await response.json().catch(() => null);
    const errorIdentifier = getResendErrorIdentifier(errorBody);
    const retryable = response.status === 429
      || response.status >= 500
      || (response.status === 409 && errorIdentifier === "concurrent_idempotent_requests");
    return {
      ok: false,
      retryable,
      error: `Resend HTTP ${response.status}${errorIdentifier ? ` (${errorIdentifier})` : ""}`,
    };
  } catch (error) {
    return { ok: false, retryable: true, error: error instanceof Error ? error.message : "Resend request failed" };
  } finally {
    clearTimeout(timeout);
  }
}
