import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { claimPendingEmailOutboxMessages } from "../src/db/queries/email-outbox";
import { sendEmailWithResend } from "../src/lib/auth/resend";

const settings = { deliveryBatchSize: 10, deliveryMaxAttempts: 5, retryBaseSeconds: 120, retryMaxSeconds: 3600 };
const config = { apiKey: "re_test", fromName: "Archive", fromEmail: "mail@example.invalid", enabled: true };
const rendered = { subject: "Test", html: "<p>Test</p>", text: "Test" };
type Message = Awaited<ReturnType<typeof claimPendingEmailOutboxMessages>>[number];
function message(id: number): Message {
  return { id, template: "verify_email", recipient: "to@example.invalid", encryptedPayload: "fixture", status: "sending", attempts: 1,
    leaseToken: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`, nextAttemptAt: new Date(), createdAt: new Date(), updatedAt: new Date(), lastError: null, sentAt: null };
}
const base = {
  getResendEmailDeliveryReadiness: async () => ({ config, siteOrigin: new URL("https://example.invalid") }),
  decryptEmailOutboxPayload: () => ({}), renderAuthorEmail: () => rendered,
};

test("delivery validates each claimed row and counts only fenced completion; Resend key stays ID plus exact body hash", { skip: !process.env.NODE_PATH }, async () => {
  const { deliverPendingAuthorEmails } = await import("../src/lib/auth/email-outbox-delivery");
  const previousFetch = globalThis.fetch;
  const keys: string[] = [];
  const bodies: string[] = [];
  const validated: number[] = [];
  try {
    globalThis.fetch = async (_url, init) => {
      keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      bodies.push(String(init?.body));
      return new Response(null, { status: 200 });
    };
    const result = await deliverPendingAuthorEmails(settings, undefined, {
      ...base, claimPendingEmailOutboxMessages: async () => [message(1), message(2), message(3)],
      validateEmailOutboxLease: async (id) => { validated.push(id); return id !== 2; },
      updateEmailOutboxStatus: async ({ id, leaseToken }) => { assert.equal(leaseToken, message(id).leaseToken); return id !== 3; },
    });
    assert.deepEqual(result, { ok: true, delivered: 1, processed: 3 });
    assert.deepEqual(validated, [1, 2, 3]);
    assert.deepEqual(keys, [1, 3].map((id, index) => `author-email-outbox-${id}-${createHash("sha256").update(bodies[index]).digest("hex").slice(0, 16)}`));
    await sendEmailWithResend({ config, idempotencyKey: "author-email-outbox-1", recipient: "to@example.invalid", ...rendered });
    assert.equal(keys[0], keys[2]);
  } finally { globalThis.fetch = previousFetch; }
});

test("abort during a send stops the batch and does not record a successful stale completion", { skip: !process.env.NODE_PATH }, async () => {
  const { deliverPendingAuthorEmails } = await import("../src/lib/auth/email-outbox-delivery");
  const controller = new AbortController();
  let sends = 0;
  let completions = 0;
  await assert.rejects(deliverPendingAuthorEmails(settings, controller.signal, {
    ...base, claimPendingEmailOutboxMessages: async () => [message(1), message(2)], validateEmailOutboxLease: async () => true,
    sendEmailWithResend: async ({ signal }) => { sends++; assert.equal(signal, controller.signal); controller.abort(); throw controller.signal.reason; },
    updateEmailOutboxStatus: async () => { completions++; return true; },
  }), { name: "AbortError" });
  assert.equal(sends, 1);
  assert.equal(completions, 0);
});

test("Resend forwards abort to the actual HTTP request", async () => {
  const previousFetch = globalThis.fetch;
  const controller = new AbortController();
  let requestSignal: AbortSignal | undefined;
  try {
    globalThis.fetch = async (_url, init) => {
      requestSignal = init?.signal as AbortSignal;
      controller.abort();
      assert.equal(requestSignal.aborted, true);
      throw requestSignal.reason;
    };
    const result = await sendEmailWithResend({ config, idempotencyKey: "author-email-outbox-1", recipient: "to@example.invalid", ...rendered, signal: controller.signal });
    assert.equal(result.ok, false);
    assert.equal(requestSignal?.aborted, true);
  } finally { globalThis.fetch = previousFetch; }
});
