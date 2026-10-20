import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

const testUrl = process.env.P1_TEST_DATABASE_URL;

test("email leases fence stale workers, charge crashes and quarantine unknown legacy sends", { skip: !testUrl }, async () => {
  const schema = `email_lease_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const { claimPendingEmailOutboxMessages: claim, updateEmailOutboxStatus: complete, validateEmailOutboxLease, getEmailLeaseCutoverReport } = await import("../src/db/queries/email-outbox");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE email_outbox (
      id serial PRIMARY KEY, template text NOT NULL DEFAULT 'verify_email', recipient text NOT NULL DEFAULT 'test@example.invalid',
      encrypted_payload text NOT NULL DEFAULT 'fixture', status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
      lease_token text, next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, last_error text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX email_outbox_delivery_idx ON email_outbox(status,next_attempt_at);
      CREATE TABLE email_delivery_settings(id integer PRIMARY KEY, enabled boolean, encrypted_api_key text);
      INSERT INTO email_delivery_settings VALUES (1,false,'fixture');
      INSERT INTO email_outbox DEFAULT VALUES; INSERT INTO email_outbox DEFAULT VALUES;`);
    const [first, second] = await Promise.all([claim(1), claim(1)]);
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.notEqual(first[0].id, second[0].id);
    assert.notEqual(first[0].leaseToken, second[0].leaseToken);
    const original = first[0];
    assert.equal(original.attempts, 1);
    assert.equal(await validateEmailOutboxLease(original.id, original.leaseToken!), true);
    await client`UPDATE email_outbox SET updated_at=clock_timestamp()-interval '16 minutes' WHERE id=${original.id}`;
    assert.equal(await complete({ id: original.id, leaseToken: original.leaseToken!, status: "sent" }), false);
    const [replacement] = await claim(1);
    assert.equal(replacement.id, original.id);
    assert.equal(replacement.attempts, 2);
    assert.notEqual(replacement.leaseToken, original.leaseToken);
    assert.equal(await complete({ id: original.id, leaseToken: original.leaseToken!, status: "failed" }), false);
    assert.equal(await complete({ id: replacement.id, leaseToken: replacement.leaseToken!, status: "sent" }), true);
    assert.equal(await complete({ id: replacement.id, leaseToken: replacement.leaseToken!, status: "pending" }), false);
    const [sent] = await client`SELECT lease_token,status,attempts FROM email_outbox WHERE id=${original.id}`;
    assert.deepEqual(sent, { lease_token: null, status: "sent", attempts: 2 });

    await client`INSERT INTO email_outbox(status,attempts,updated_at) VALUES ('sending',0,clock_timestamp()-interval '16 minutes')`;
    assert.equal((await getEmailLeaseCutoverReport()).ready, false);
    assert.deepEqual(await claim(50), []);
    const [unknown] = await client`SELECT status,last_error FROM email_outbox WHERE lease_token IS NULL AND status='failed'`;
    assert.deepEqual(unknown, { status: "failed", last_error: "Исход предыдущей доставки неизвестен. Требуется ручная проверка перед повтором." });
    assert.equal((await getEmailLeaseCutoverReport()).unknownFailed, 1);

    const remaining = second[0];
    await client`UPDATE email_outbox SET updated_at=clock_timestamp()-interval '16 minutes',attempts=5 WHERE id=${remaining.id}`;
    assert.deepEqual(await claim(50, 5), []);
    const [exhausted] = await client`SELECT status,attempts,lease_token FROM email_outbox WHERE id=${remaining.id}`;
    assert.deepEqual(exhausted, { status: "failed", attempts: 5, lease_token: null });

    const { deliverPendingAuthorEmails } = await import("../src/lib/auth/email-outbox-delivery");
    const [{ id: retryId }] = await client`INSERT INTO email_outbox DEFAULT VALUES RETURNING id`;
    const previousFetch = globalThis.fetch;
    const keys: string[] = [];
    const requestBodies: string[] = [];
    try {
      globalThis.fetch = async (_url, init) => {
        keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
        requestBodies.push(String(init?.body));
        return new Response(null, { status: keys.length === 1 ? 429 : 200 });
      };
      const settings = { deliveryBatchSize: 10, deliveryMaxAttempts: 5, retryBaseSeconds: 120, retryMaxSeconds: 3600 };
      const dependencies = {
        getResendEmailDeliveryReadiness: async () => ({ config: { apiKey: "re_fixture", fromName: "Fixture", fromEmail: "from@example.invalid", enabled: true }, siteOrigin: new URL("https://example.invalid") }),
        decryptEmailOutboxPayload: () => ({}), renderAuthorEmail: () => ({ subject: "Fixture", html: "<p>Fixture</p>", text: "Fixture" }),
      };
      assert.deepEqual(await deliverPendingAuthorEmails(settings, undefined, dependencies), { ok: true, delivered: 0, processed: 1 });
      await client`UPDATE email_outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=${retryId}`;
      assert.deepEqual(await deliverPendingAuthorEmails(settings, undefined, dependencies), { ok: true, delivered: 1, processed: 1 });
      assert.equal(keys.length, 2);
      assert.equal(keys[0], keys[1]);
      assert.equal(keys[0], `author-email-outbox-${retryId}-${createHash("sha256").update(requestBodies[0]).digest("hex").slice(0, 16)}`);
      const [retried] = await client`SELECT status,attempts,lease_token FROM email_outbox WHERE id=${retryId}`;
      assert.deepEqual(retried, { status: "sent", attempts: 2, lease_token: null });
    } finally { globalThis.fetch = previousFetch; }

    await client`INSERT INTO email_outbox(status) VALUES ('sending')`;
    await client.unsafe("ALTER TABLE email_outbox DROP COLUMN lease_token");
    const beforeMigration = await getEmailLeaseCutoverReport();
    assert.equal(beforeMigration.schemaReady, false);
    assert.equal(beforeMigration.ready, false);
    assert.equal(beforeMigration.legacySending, 1);
    assert.equal(beforeMigration.rows.some(row => row.status === "sending"), true);
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
