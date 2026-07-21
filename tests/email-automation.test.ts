import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateEmailRetryDelaySeconds, sanitizeEmailDeliveryError, validateEmailAutomationSettings } from "@/lib/auth/email-automation";

const read = (path: string) => readFileSync(path, "utf8");

test("validates automation ranges and retry ordering", () => {
  const valid = { deliveryIntervalSeconds: 60, deliveryBatchSize: 10, deliveryMaxAttempts: 5, retryBaseSeconds: 120, retryMaxSeconds: 3600, cleanupIntervalSeconds: 86400, challengeRetentionHours: 24, sessionRetentionDays: 7, staleRegistrationDays: 7, sentOutboxRetentionDays: 30, failedOutboxRetentionDays: 30 };
  assert.deepEqual(validateEmailAutomationSettings(valid), valid);
  assert.equal(validateEmailAutomationSettings({ ...valid, deliveryBatchSize: 0 }), null);
  assert.equal(validateEmailAutomationSettings({ ...valid, retryMaxSeconds: 60 }), null);
  assert.equal(validateEmailAutomationSettings({ ...valid, failedOutboxRetentionDays: 6 }), null);
});

test("calculates capped exponential retry from the completed attempt", () => {
  assert.equal(calculateEmailRetryDelaySeconds({ attempts: 1, baseSeconds: 60, maxSeconds: 500 }), 60);
  assert.equal(calculateEmailRetryDelaySeconds({ attempts: 3, baseSeconds: 60, maxSeconds: 500 }), 240);
  assert.equal(calculateEmailRetryDelaySeconds({ attempts: 8, baseSeconds: 60, maxSeconds: 500 }), 500);
});

test("sanitizes delivery errors before persistence and bounds length", () => {
  const sanitized = sanitizeEmailDeliveryError(`Bearer secret re_abcdef user@example.com https://example.com/path?token=secret#part ${"x".repeat(600)}`);
  assert.doesNotMatch(sanitized, /secret|abcdef|user@example|token=/);
  assert.doesNotMatch(sanitized, /https?:\/\//);
  assert.match(sanitized, /Bearer \[redacted\]|re_\[redacted\]|\[email\]|\[url\]/);
  assert.ok(sanitized.length <= 500);
});

test("schema and migration define singleton settings, leased jobs and queue indexes", () => {
  const schema = read("src/db/schema.ts");
  const migration = read("drizzle/0034_email_automation.sql");
  const journal = read("drizzle/meta/_journal.json");
  for (const source of [schema, migration]) {
    assert.match(source, /email_automation_settings/);
    assert.match(source, /email_automation_jobs/);
    assert.match(source, /delivery_interval/);
    assert.match(source, /retry_max/);
    assert.match(source, /failed_outbox_retention/);
    assert.match(source, /email_automation_settings_singleton_id_check/);
    assert.match(source, /email_automation_delivery_attempts_check/);
    assert.match(source, /email_automation_retry_max_check/);
    assert.match(source, /email_automation_jobs_job_check/);
    assert.match(source, /email_automation_jobs_status_check/);
  }
  assert.match(migration, /INSERT INTO "email_automation_settings" \("id"\) VALUES \(1\)/);
  assert.match(migration, /INSERT INTO "email_automation_jobs"[\s\S]*'delivery'[\s\S]*'cleanup'/);
  assert.match(migration, /email_outbox_status_created_id_idx/);
  assert.match(migration, /email_outbox_created_id_idx/);
  assert.match(journal, /0034_email_automation/);
});

test("scheduler claims due unlocked jobs with a shared fifteen minute lease and snapshots settings", () => {
  const query = read("src/db/queries/email-automation.ts");
  assert.match(query, /lte\(emailAutomationJobs\.nextRunAt, now\)/);
  assert.match(query, /isNull\(emailAutomationJobs\.leaseUntil\)[\s\S]*lte\(emailAutomationJobs\.leaseUntil, now\)/);
  assert.match(query, /EMAIL_AUTOMATION_LEASE_MS/);
  assert.match(read("src/lib/auth/email-automation.ts"), /EMAIL_AUTOMATION_LEASE_MS = 15 \* 60 \* 1000/);
  assert.match(query, /for\("update", \{ skipLocked: true \}\)/);
  assert.match(query, /settings: settings \?\? EMAIL_AUTOMATION_DEFAULTS/);
  assert.match(query, /input\.ok \? input\.intervalSeconds : 60/);
  assert.match(query, /eq\(emailAutomationJobs\.leaseUntil, input\.leaseUntil\)/);
});

test("delivery uses dynamic attempts, backoff, sanitization and sending-only completion", () => {
  const delivery = read("src/lib/auth/email-outbox-delivery.ts");
  const outbox = read("src/db/queries/email-outbox.ts");
  assert.match(delivery, /settings\.deliveryBatchSize/);
  assert.match(delivery, /settings\.deliveryMaxAttempts/);
  assert.match(delivery, /calculateEmailRetryDelaySeconds/);
  assert.match(delivery, /sanitizeEmailDeliveryError/);
  const claimStart = outbox.indexOf("export async function claimPendingEmailOutboxMessages");
  const claimEnd = outbox.indexOf("export async function updateEmailOutboxStatus");
  const claim = outbox.slice(claimStart, claimEnd);
  assert.match(claim, /attempts} >= \$\{maxAttempts}[\s\S]*eq\(emailOutbox\.status, "pending"\)[\s\S]*eq\(emailOutbox\.status, "sending"\)[\s\S]*lte\(emailOutbox\.updatedAt, staleLease\)/);
  assert.match(claim, /lt\(emailOutbox\.attempts, maxAttempts\)[\s\S]*eq\(emailOutbox\.status, "pending"\)[\s\S]*eq\(emailOutbox\.status, "sending"\)/);
  assert.match(claim, /EMAIL_AUTOMATION_LEASE_MS/);
  assert.match(outbox, /eq\(emailOutbox\.status, "sending"\)/);
});

test("cleanup deletes only retained sent and failed outbox records", () => {
  const cleanup = read("src/db/operations/author-auth.ts");
  assert.match(cleanup, /eq\(emailOutbox\.status, "sent"\)[\s\S]*lt\(emailOutbox\.sentAt, sentOutboxCutoff\)/);
  assert.match(cleanup, /eq\(emailOutbox\.status, "failed"\)[\s\S]*lt\(emailOutbox\.updatedAt, failedOutboxCutoff\)/);
  assert.doesNotMatch(cleanup, /eq\(emailOutbox\.status, "(?:pending|sending)"\)/);
});

test("cleanup serializes retention dates through typed conditions or ISO values", () => {
  const cleanup = read("src/db/operations/author-auth.ts");
  assert.match(cleanup, /lt\(authorAuthChallenges\.expiresAt, challengeCutoff\)/);
  assert.match(cleanup, /lt\(authorSessions\.expiresAt, sessionCutoff\)/);
  assert.match(cleanup, /registrationCutoff\.toISOString\(\)/);
  assert.doesNotMatch(cleanup, /\$\{(?:challenge|session|registration|sentOutbox|failedOutbox)Cutoff\}/);
});

test("admin queue projection excludes encrypted payload and retry resets delivery state", () => {
  const query = read("src/db/queries/email-outbox.ts");
  const start = query.indexOf("export async function getAdminEmailOutbox");
  const end = query.indexOf("export async function getEmailOutboxStatusCounts");
  const adminQueue = query.slice(start, end);
  assert.doesNotMatch(adminQueue, /encryptedPayload|encrypted_payload/);
  assert.match(adminQueue, /count\(\*\)::int/);
  assert.match(adminQueue, /eq\(emailOutbox\.status, input\.status\)/);
  assert.match(adminQueue, /eq\(emailOutbox\.template, input\.template\)/);
  assert.match(adminQueue, /recipient: maskEmailRecipient\(row\.recipient\)/);
  assert.match(adminQueue, /\.limit\(pageSize\)\.offset\(\(page - 1\) \* pageSize\)/);
  assert.doesNotMatch(query, /input\.limit|limit \?\? 100/);
  assert.match(query, /id: number;[\s\S]*eq\(emailOutbox\.id, input\.id\)/);
  assert.match(query, /eq\(emailOutbox\.status, "failed"\)/);
  assert.match(query, /status: "pending", attempts: 0, nextAttemptAt: now, sentAt: null, lastError: null/);
});

test("email routes expose sidebar sections and provider actions redirect locally", () => {
  const root = read("src/app/admin/(protected)/tools/email/page.tsx");
  const nav = read("src/app/admin/(protected)/tools/email/email-tools-nav.tsx");
  const provider = read("src/app/admin/(protected)/tools/email/provider/actions.ts");
  assert.match(root, /redirect\("\/admin\/tools\/email\/general"\)/);
  for (const route of ["general", "provider", "queue"]) assert.match(nav, new RegExp(`/admin/tools/email/${route}`));
  assert.match(provider, /PROVIDER_PATH = "\/admin\/tools\/email\/provider"/);
  assert.doesNotMatch(provider, /retryFailedEmail/);
});

test("queue filters auto-submit inline and dates use the journal local-time component", () => {
  const page = read("src/app/admin/(protected)/tools/email/queue/page.tsx");
  const filters = read("src/app/admin/(protected)/tools/email/queue/email-queue-filters.tsx");
  const action = read("src/app/admin/(protected)/tools/email/queue/actions.ts");
  assert.match(filters, /grid grid-cols-3/);
  assert.match(filters, /requestSubmit\(\)/);
  assert.match(filters, /onChange=\{submit\}/);
  assert.doesNotMatch(page, /Применить|Повторить до 100/);
  assert.doesNotMatch(action, /limit: 100/);
  assert.match(page, /ActivityLogTime/);
  assert.doesNotMatch(page, /toLocaleString\("ru-RU"\)/);
});

test("automation job dates use the user's local timezone", () => {
  const page = read("src/app/admin/(protected)/tools/email/general/page.tsx");
  assert.match(page, /ActivityLogTime/);
  assert.match(page, /job\.lastStartedAt\.toISOString\(\)/);
  assert.match(page, /job\.lastFinishedAt\.toISOString\(\)/);
  assert.match(page, /job\.nextRunAt\.toISOString\(\)/);
  assert.doesNotMatch(page, /toLocaleString\("ru-RU"\)/);
});

test("settings mutation writes its required prepared audit in the same transaction", () => {
  const action = read("src/app/admin/(protected)/tools/email/general/actions.ts");
  const query = read("src/db/queries/email-automation.ts");
  assert.match(action, /prepareActivityLog\([\s\S]*email-automation\.updated/);
  assert.match(query, /saveEmailAutomationSettings[\s\S]*db\.transaction\(async \(tx\)[\s\S]*insert\(emailAutomationSettings\)[\s\S]*insert\(adminActivityLogs\)/);
});

test("provider and queue durable mutations insert prepared audits in their transactions", () => {
  const providerAction = read("src/app/admin/(protected)/tools/email/provider/actions.ts");
  const providerQuery = read("src/db/queries/email-provider.ts");
  const queueAction = read("src/app/admin/(protected)/tools/email/queue/actions.ts");
  const outboxQuery = read("src/db/queries/email-outbox.ts");
  assert.match(providerAction, /prepareActivityLog[\s\S]*saveResendEmailConfig\([\s\S]*activityLogs/);
  assert.match(providerAction, /prepareActivityLog[\s\S]*setEmailDeliveryEnabled\(\{ enabled: false[\s\S]*activityLog/);
  assert.match(providerQuery, /saveResendEmailConfig[\s\S]*db\.transaction[\s\S]*insert\(emailDeliverySettings\)[\s\S]*insert\(adminActivityLogs\)/);
  assert.match(providerQuery, /setEmailDeliveryEnabled[\s\S]*db\.transaction[\s\S]*update\(emailDeliverySettings\)[\s\S]*insert\(adminActivityLogs\)/);
  assert.match(queueAction, /prepareActivityLog[\s\S]*retryFailedEmailOutbox/);
  assert.doesNotMatch(queueAction, /logActivity/);
  assert.match(outboxQuery, /retryFailedEmailOutbox[\s\S]*db\.transaction[\s\S]*update\(emailOutbox\)[\s\S]*insert\(adminActivityLogs\)/);
});

test("both production workers poll the DB-backed scheduler every minute", () => {
  const compose = read("docker-compose.yml");
  const emailWorker = compose.slice(compose.indexOf("  email-worker:"), compose.indexOf("  auth-cleanup-worker:"));
  const cleanupWorker = compose.slice(compose.indexOf("  auth-cleanup-worker:"), compose.indexOf("  redis:"));
  for (const worker of [emailWorker, cleanupWorker]) assert.match(worker, /sleep 60/);
  assert.doesNotMatch(cleanupWorker, /sleep 86400/);
});
