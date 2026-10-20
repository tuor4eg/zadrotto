import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;

test("automoderation fencing, crash recovery and terminal outcomes", { skip: !databaseUrl }, async (t) => {
  const schema = `p1_automod_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "5";
  const { db, getDbClient } = await import("../src/db");
  const client = getDbClient();
  const { sql } = await import("drizzle-orm");
  const { guardAutomoderationJob, reconcileAutomoderationJob, recoverOrphanedAutomoderationChecks } =
    await import("../src/db/queries/automoderation-recovery");
  const { processAutomoderationCheck } = await import("../src/lib/automoderation/process");
  const { autoApproveMediaItem } = await import("../src/lib/automoderation/media-policy");

  try {
    await client.unsafe(`create schema ${schema}`);
    await client.unsafe(`create table job_runs (
      id serial primary key, type text not null, payload jsonb not null,
      status text not null, lock_token text, lock_expires_at timestamptz
    )`);
    await client.unsafe(`create unique index active_automod on job_runs ((payload->>'checkId'))
      where type = 'moderation.auto-check' and status in ('queued','running')`);
    await client.unsafe(`create table automoderation_checks (
      id serial primary key, source_event_id uuid not null, subject_type text not null default 'media-item',
      subject_key text not null default '1', subject_revision integer not null default 1,
      policy_code text not null default 'media-item-publication', policy_version integer not null default 1,
      mode text not null default 'enforce', status text not null default 'pending', decision text,
      reason_codes jsonb not null default '[]', input_fingerprint text not null default 'fixture',
      check_results jsonb not null default '{}', completed_at timestamptz, auto_approved_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    )`);
    await client.unsafe(`create index pending_checks on automoderation_checks(status,created_at)
      where status in ('pending','running')`);
    const check = async (status = "running") => {
      const [row] = await client`insert into automoderation_checks(source_event_id,status)
        values(${randomUUID()},${status}) returning id`;
      return Number(row.id);
    };
    const run = async (checkId: number, status = "running") => {
      const [row] = await client`insert into job_runs(type,payload,status,lock_token,lock_expires_at)
        values('moderation.auto-check',${JSON.stringify({ checkId })}::text::jsonb,${status},'old',now()+interval '1 hour') returning id`;
      return Number(row.id);
    };
    const outcome = async (id: number) => (await client`select status,decision,reason_codes from automoderation_checks where id=${id}`)[0];

    await t.test("rotated token rejects every old-owner entry point", async () => {
      const id = await check();
      const runId = await run(id);
      assert.equal((await client`select payload->>'checkId' as check_id from job_runs where id=${runId}`)[0].check_id, String(id));
      await client`update job_runs set lock_token='new' where id=${runId}`;
      const jobGuard = { runId, lockToken: "old" };
      await assert.rejects(processAutomoderationCheck(id, { jobGuard }));
      await assert.rejects(autoApproveMediaItem({
        checkId: id, mediaItemId: 1, expectedRevision: 1, expectedUpdatedAt: new Date(), jobGuard,
      }));
      assert.equal((await outcome(id)).status, "running");
      await db.transaction((tx) => guardAutomoderationJob(tx, id, { runId, lockToken: "new" }));
    });

    await t.test("valid token cannot be used for another check or job type", async () => {
      const id = await check();
      const runId = await run(id);
      await assert.rejects(db.transaction((tx) => guardAutomoderationJob(tx, id + 10000, { runId, lockToken: "old" })));
      await client`update job_runs set type='other.job' where id=${runId}`;
      await assert.rejects(db.transaction((tx) => guardAutomoderationJob(tx, id, { runId, lockToken: "old" })));
    });

    await t.test("final expiry check rolls back mutations made under the original token", async () => {
      const id = await check();
      const runId = await run(id);
      await assert.rejects(db.transaction(async (tx) => {
        await guardAutomoderationJob(tx, id, { runId, lockToken: "old" });
        await tx.execute(sql`update automoderation_checks set status='completed' where id=${id}`);
        await tx.execute(sql`update job_runs set lock_expires_at=clock_timestamp()-interval '1 second' where id=${runId}`);
        await guardAutomoderationJob(tx, id, { runId, lockToken: "old" });
      }));
      assert.equal((await outcome(id)).status, "running");
    });

    await t.test("crash reconciliation is atomic and never overwrites committed approval", async () => {
      const id = await check();
      await assert.rejects(db.transaction(async (tx) => {
        await reconcileAutomoderationJob(tx, { checkId: id, retry: false });
        throw new Error("simulated crash before commit");
      }));
      assert.equal((await outcome(id)).status, "running");
      await db.transaction((tx) => reconcileAutomoderationJob(tx, { checkId: id, retry: false }));
      assert.equal((await outcome(id)).decision, "NEEDS_REVIEW");
      await client`update automoderation_checks set status='completed',decision='AUTO_APPROVE' where id=${id}`;
      await db.transaction((tx) => reconcileAutomoderationJob(tx, { checkId: id, retry: true }));
      await processAutomoderationCheck(id);
      assert.equal((await outcome(id)).decision, "AUTO_APPROVE");
    });

    await t.test("orphan repair preserves queued/running work and handles deleted job history", async () => {
      const queued = await check("pending");
      const active = await check();
      const orphan = await check();
      const failed = await check();
      await run(queued, "queued");
      await run(active);
      await run(failed, "failed");
      await db.transaction((tx) => recoverOrphanedAutomoderationChecks(tx, 100));
      assert.equal((await outcome(queued)).status, "pending");
      assert.equal((await outcome(active)).status, "running");
      assert.equal((await outcome(orphan)).decision, "NEEDS_REVIEW");
      assert.equal((await outcome(failed)).decision, "NEEDS_REVIEW");
    });

    await t.test("concurrent recovery skips a check held by another transaction", async () => {
      const id = await check();
      let unlock!: () => void;
      let announce!: () => void;
      const locked = new Promise<void>((resolve) => { announce = resolve; });
      const release = new Promise<void>((resolve) => { unlock = resolve; });
      const holder = client.begin(async (tx) => {
        await tx`select id from automoderation_checks where id=${id} for update`;
        announce();
        await release;
      });
      await locked;
      try {
        const rows = await db.transaction((tx) => recoverOrphanedAutomoderationChecks(tx));
        assert.equal(rows.some((row) => row.id === id), false);
      } finally {
        unlock();
        await holder;
      }
      await db.transaction((tx) => recoverOrphanedAutomoderationChecks(tx));
      assert.equal((await outcome(id)).decision, "NEEDS_REVIEW");
    });
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end({ timeout: 5 });
  }
});
