import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { renderAuthorEmail } from "@/lib/auth/email-templates";
import { sendEmailWithResend } from "@/lib/auth/resend";
import { validateResendEmailConfig } from "@/lib/auth/email-provider";

const config = { apiKey: "re_test", fromName: "Archive", fromEmail: "mail@example.com", enabled: true };

describe("Resend author email", () => {
  it("strictly validates and normalizes admin configuration", () => {
    assert.deepEqual(validateResendEmailConfig({
      apiKey: `re_${"a".repeat(24)}`,
      fromName: " Archive ",
      fromEmail: " MAIL@Example.COM ",
      replyTo: " Reply@Example.COM ",
      enabled: true,
    }), {
      apiKey: `re_${"a".repeat(24)}`,
      fromName: "Archive",
      fromEmail: "mail@example.com",
      replyTo: "reply@example.com",
      enabled: true,
    });
    assert.equal(validateResendEmailConfig({ apiKey: "bad", fromName: "Archive", fromEmail: "mail@example.com", enabled: true }), null);
    assert.equal(validateResendEmailConfig({ apiKey: `re_${"a".repeat(24)}`, fromName: "", fromEmail: "mail@example.com", enabled: true }), null);
  });
  it("renders every auth template in html and text", () => {
    for (const template of ["verify_email", "reset_password", "email_changed", "registration_approved", "registration_rejected"] as const) {
      const rendered = renderAuthorEmail({ template, payload: { token: "secret token" }, siteUrl: "https://example.com" });
      assert.ok(rendered.subject);
      assert.ok(rendered.text);
      assert.match(rendered.html, /<p>/);
    }
  });

  it("URL-encodes challenge tokens in action links", () => {
    const verify = renderAuthorEmail({
      template: "verify_email",
      payload: { token: "a+b&c?d" },
      siteUrl: "https://example.com/base",
    });
    const reset = renderAuthorEmail({
      template: "reset_password",
      payload: { token: "a+b&c?d" },
      siteUrl: "https://example.com/base",
    });

    assert.match(verify.text, /\/author\/verify-email#token=a%2Bb%26c%3Fd/);
    assert.match(reset.text, /\/author\/reset-password\?token=a%2Bb%26c%3Fd/);
    assert.doesNotMatch(verify.html, /a\+b&c\?d/);
  });

  it("sends idempotent Resend requests and classifies status codes", async () => {
    const previousFetch = globalThis.fetch;
    let headers: Headers | null = null;
    let requestUrl = "";
    let requestBody: Record<string, unknown> | null = null;
    try {
      globalThis.fetch = async (url, init) => {
        requestUrl = String(url);
        headers = new Headers(init?.headers);
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response("", { status: 429 });
      };
      const retryable = await sendEmailWithResend({ config, idempotencyKey: "author-email-outbox-7", recipient: "to@example.com", subject: "Test", html: "<p>Test</p>", text: "Test" });
      assert.deepEqual(retryable, { ok: false, retryable: true, error: "Resend HTTP 429" });
      assert.equal(requestUrl, "https://api.resend.com/emails");
      assert.equal(headers?.get("Authorization"), "Bearer re_test");
      assert.equal(headers?.get("Content-Type"), "application/json");
      assert.match(headers?.get("Idempotency-Key") ?? "", /^author-email-outbox-7-[a-f0-9]{16}$/);
      assert.ok((headers?.get("Idempotency-Key")?.length ?? 0) <= 256);
      assert.equal(headers?.get("User-Agent"), "zadrotto-author-email/1.0");
      assert.deepEqual(requestBody?.to, ["to@example.com"]);
      assert.equal(requestBody?.from, "Archive <mail@example.com>");

      globalThis.fetch = async () => new Response("", { status: 400 });
      assert.equal((await sendEmailWithResend({ config, idempotencyKey: "x", recipient: "to@example.com", subject: "Test", html: "x", text: "x" })).retryable, false);

      globalThis.fetch = async () => new Response("", { status: 503 });
      assert.equal((await sendEmailWithResend({ config, idempotencyKey: "x", recipient: "to@example.com", subject: "Test", html: "x", text: "x" })).retryable, true);

      globalThis.fetch = async () => { throw new Error("network unavailable"); };
      assert.deepEqual(
        await sendEmailWithResend({ config, idempotencyKey: "x", recipient: "to@example.com", subject: "Test", html: "x", text: "x" }),
        { ok: false, retryable: true, error: "network unavailable" },
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("binds idempotency keys to the exact serialized request payload", async () => {
    const previousFetch = globalThis.fetch;
    const keys: string[] = [];
    try {
      globalThis.fetch = async (_url, init) => {
        keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
        return new Response("", { status: 200 });
      };
      const base = { config, idempotencyKey: "x".repeat(300), recipient: "to@example.com", subject: "Test", html: "<p>Test</p>", text: "Test" };
      await sendEmailWithResend(base);
      await sendEmailWithResend(base);
      await sendEmailWithResend({ ...base, text: "Changed" });
      assert.equal(keys[0], keys[1]);
      assert.notEqual(keys[0], keys[2]);
      assert.ok(keys.every((key) => key.length <= 256));
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("classifies Resend 409 identifiers without retaining untrusted body text", async () => {
    const previousFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => Response.json({ name: "concurrent_idempotent_requests", message: "user@example.com Bearer secret" }, { status: 409 });
      assert.deepEqual(await sendEmailWithResend({ config, idempotencyKey: "x", recipient: "to@example.com", subject: "Test", html: "x", text: "x" }), {
        ok: false, retryable: true, error: "Resend HTTP 409 (concurrent_idempotent_requests)",
      });
      globalThis.fetch = async () => Response.json({ code: "invalid_idempotent_request", message: "https://evil.example/?token=secret" }, { status: 409 });
      const invalid = await sendEmailWithResend({ config, idempotencyKey: "x", recipient: "to@example.com", subject: "Test", html: "x", text: "x" });
      assert.deepEqual(invalid, { ok: false, retryable: false, error: "Resend HTTP 409 (invalid_idempotent_request)" });
      assert.doesNotMatch(invalid.error, /evil|token|secret/);
      globalThis.fetch = async () => Response.json({ type: "<script>malicious</script>", message: "raw private body" }, { status: 409 });
      assert.deepEqual(await sendEmailWithResend({ config, idempotencyKey: "x", recipient: "to@example.com", subject: "Test", html: "x", text: "x" }), {
        ok: false, retryable: false, error: "Resend HTTP 409",
      });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("enforces a bounded Resend request timeout", () => {
    const source = readFileSync("src/lib/auth/resend.ts", "utf8");
    assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 10_000\)/);
    assert.match(source, /signal: controller\.signal/);
    assert.match(source, /finally \{\s*clearTimeout\(timeout\)/);
  });

  it("loads DB config before claiming outbox rows", () => {
    const worker = readFileSync("src/lib/auth/email-outbox-delivery.ts", "utf8");
    assert.ok(worker.indexOf("getResendEmailDeliveryReadiness()") < worker.indexOf("claimPendingEmailOutboxMessages("));
    assert.match(worker, /author-email-outbox-\$\{message\.id\}/);
    assert.doesNotMatch(worker, /AUTH_EMAIL_WEBHOOK/);
  });

  it("keeps Resend credentials outside cover-provider storage", () => {
    const query = readFileSync("src/db/queries/email-provider.ts", "utf8");
    const schema = readFileSync("src/db/schema.ts", "utf8");
    const coverCrypto = readFileSync("src/lib/covers/credential-crypto.ts", "utf8");
    assert.match(query, /emailDeliverySettings/);
    assert.doesNotMatch(query, /providerCredentials|credential-crypto/);
    assert.match(schema, /"email_delivery_settings"/);
    assert.doesNotMatch(coverCrypto, /resend|EMAIL_PROVIDER_CREDENTIALS_KEY/);
  });

  it("uses a singleton email settings table in schema and migration", () => {
    const schema = readFileSync("src/db/schema.ts", "utf8");
    const migration = readFileSync("drizzle/0032_yielding_blockbuster.sql", "utf8");

    for (const source of [schema, migration]) {
      assert.match(source, /email_delivery_settings/);
      assert.match(source, /email_delivery_settings_singleton_id_check/);
      assert.match(source, /email_delivery_settings_provider_check/);
    }
    assert.match(migration, /CHECK \("email_delivery_settings"\."id" = 1\)/);
    assert.match(migration, /CHECK \("email_delivery_settings"\."provider" = 'resend'\)/);
  });

  it("separates provider credentials from outbox payload encryption", () => {
    const providerCrypto = readFileSync("src/lib/auth/email-provider-crypto.ts", "utf8");
    const outboxCrypto = readFileSync("src/lib/auth/email-outbox-crypto.ts", "utf8");

    assert.match(providerCrypto, /EMAIL_PROVIDER_CREDENTIALS_KEY/);
    assert.doesNotMatch(providerCrypto, /EMAIL_OUTBOX_ENCRYPTION_KEY/);
    assert.match(providerCrypto, /aes-256-gcm/);
    assert.match(providerCrypto, /setAuthTag/);
    assert.match(providerCrypto, /catch \{\s*return null/);
    assert.match(outboxCrypto, /EMAIL_OUTBOX_ENCRYPTION_KEY/);
    assert.doesNotMatch(outboxCrypto, /EMAIL_PROVIDER_CREDENTIALS_KEY/);
  });

  it("does not expose the decrypted API key in the admin form", () => {
    const page = readFileSync("src/app/admin/(protected)/tools/email/provider/page.tsx", "utf8");
    assert.match(page, /type="password"/);
    assert.match(page, /placeholder=\{status\.keyHint/);
    assert.doesNotMatch(page, /defaultValue=\{config\?\.apiKey\}|value=\{config\?\.apiKey\}/);
  });

  it("keeps admin save, disable, test and retry actions explicit", () => {
    const actions = readFileSync("src/app/admin/(protected)/tools/email/provider/actions.ts", "utf8");
    assert.match(actions, /saveEmailProviderAction[\s\S]*requireAdminUser\(\)/);
    assert.match(actions, /disableEmailProviderAction[\s\S]*setEmailDeliveryEnabled\(\{ enabled: false/);
    assert.match(actions, /testEmailProviderAction[\s\S]*sendEmailWithResend/);
    assert.match(actions, /subject: "Проверка доставки email"/);
    assert.doesNotMatch(actions, /registration_approved|renderAuthorEmail/);
    assert.doesNotMatch(actions, /retryFailedEmailsAction|retryFailedEmailOutbox/);
  });

  it("gates email-producing auth flows on asynchronous DB readiness", () => {
    const features = readFileSync("src/lib/auth/features.ts", "utf8");
    assert.match(features, /export async function isAuthorEmailDeliveryConfigured/);
    assert.match(features, /getResendEmailDeliveryReadiness/);
    assert.match(features, /Boolean\(await getResendEmailDeliveryReadiness\(\)\)/);

    for (const file of [
      "src/app/author/register/actions.ts",
      "src/app/author/(protected)/profile/actions.ts",
      "src/app/author/forgot-password/actions.ts",
    ]) {
      assert.match(readFileSync(file, "utf8"), /await isAuthorEmailDeliveryConfigured\(\)/, file);
    }
  });

  it("keeps worker configuration checks before claiming messages and preserves retry policy", () => {
    const worker = readFileSync("src/lib/auth/email-outbox-delivery.ts", "utf8");
    assert.ok(worker.indexOf("getResendEmailDeliveryReadiness()") < worker.indexOf("claimPendingEmailOutboxMessages("));
    assert.match(worker, /siteOrigin\.href/);
    assert.match(worker, /!result\.retryable \|\| attempts >= settings\.deliveryMaxAttempts \? "failed" : "pending"/);
    assert.match(worker, /calculateEmailRetryDelaySeconds/);
  });

  it("removes legacy webhook configuration from the environment contract", () => {
    const env = readFileSync(".env.example", "utf8");
    assert.match(env, /EMAIL_PROVIDER_CREDENTIALS_KEY=/);
    assert.match(env, /EMAIL_OUTBOX_ENCRYPTION_KEY=/);
    assert.match(env, /AUTH_EMAIL_WORKER_SECRET=/);
    assert.doesNotMatch(env, /AUTH_EMAIL_WEBHOOK|RESEND_API_KEY/);
  });

  it("wires production auth workers without ports or database credentials", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");
    const app = compose.slice(compose.indexOf("  app:"), compose.indexOf("  email-worker:"));
    const emailWorker = compose.slice(compose.indexOf("  email-worker:"), compose.indexOf("  auth-cleanup-worker:"));
    const cleanupWorker = compose.slice(compose.indexOf("  auth-cleanup-worker:"), compose.indexOf("  redis:"));

    for (const variable of [
      "AUTHOR_REGISTRATION_ENABLED: ${AUTHOR_REGISTRATION_ENABLED:-false}",
      "AUTHOR_REGISTRATION_ACCESS_PROFILE_CODE: ${AUTHOR_REGISTRATION_ACCESS_PROFILE_CODE:-}",
      "EMAIL_OUTBOX_ENCRYPTION_KEY: ${EMAIL_OUTBOX_ENCRYPTION_KEY}",
      "EMAIL_PROVIDER_CREDENTIALS_KEY: ${EMAIL_PROVIDER_CREDENTIALS_KEY}",
      "AUTH_EMAIL_WORKER_SECRET: ${AUTH_EMAIL_WORKER_SECRET}",
    ]) assert.match(app, new RegExp(variable.replace(/[${}]/g, "\\$&")));

    for (const worker of [emailWorker, cleanupWorker]) {
      assert.match(worker, /image: curlimages\/curl:8\.21\.0/);
      assert.match(worker, /restart: unless-stopped/);
      assert.match(worker, /while true; do/);
      assert.match(worker, /if response=\$\$\(curl/);
      assert.match(worker, /--fail-with-body/);
      assert.match(worker, /request failed; retrying (?:later|in 60 seconds)/);
      assert.match(worker, /Authorization: Bearer \$\$\{AUTH_EMAIL_WORKER_SECRET\}/);
      assert.match(worker, /--connect-timeout 5 --max-time 30/);
      assert.match(worker, /depends_on:\s+- app/);
      assert.doesNotMatch(worker, /DATABASE_URL|ports:/);
    }
    assert.match(emailWorker, /\/api\/internal\/auth-email-outbox/);
    assert.match(emailWorker, /sleep 60/);
    assert.match(cleanupWorker, /\/api\/internal\/auth-cleanup/);
    assert.match(cleanupWorker, /request completed[\s\S]*request failed; retrying later[\s\S]*sleep 60/);
    assert.doesNotMatch(cleanupWorker, /sleep 86400/);
  });

  it("documents a one-off worker invocation without starting dependencies", () => {
    const readme = readFileSync("README.md", "utf8");
    assert.match(readme, /docker compose run --rm --no-deps --entrypoint \/bin\/sh email-worker/);
    assert.match(readme, /Authorization: Bearer \$AUTH_EMAIL_WORKER_SECRET/);
    assert.match(readme, /\/api\/internal\/auth-email-outbox/);
    assert.match(readme, /Для cleanup замени конечный путь на `\/api\/internal\/auth-cleanup`/);
  });
});
