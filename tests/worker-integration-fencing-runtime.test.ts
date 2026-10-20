import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { sql } from "drizzle-orm";

const testUrl = process.env.P1_TEST_DATABASE_URL;

test("thumbnail and company checkpoints reject former owners, including lease expiry while waiting for a record", { skip: !testUrl }, async () => {
  const schema = `integration_fencing_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "4";
  const { getDbClient } = await import("../src/db");
  const { updateMediaItemCoverThumb, markMediaItemCoverThumbAttempt } = await import("../src/db/queries/cover-thumbs");
  const { checkpointGameCompanyItem } = await import("../src/db/queries/game-company-backfill");
  const { checkpointPlatformLogoJob } = await import("../src/db/queries/platform-logo-jobs");
  const client = getDbClient();
  const guard = { runId: 1, lockToken: "owner" };
  try {
    await client.unsafe(`create schema ${schema}`);
    await client.unsafe(`
      create table job_runs(id integer primary key,status text,lock_token text,lock_expires_at timestamptz,created_by_admin_id integer,payload jsonb,updated_at timestamptz);
      insert into job_runs values(1,'running','owner',clock_timestamp()+interval '30 seconds',1,'{}',now());
      create table media_items(id integer primary key,cover_url text,cover_thumb_url text,cover_thumb_attempted_at timestamptz,updated_at timestamptz);
      insert into media_items select n,'covers/'||n||'.webp',null,null,now() from generate_series(1,100000) n;
      create table game_company_backfill_items(backfill_id integer,media_item_id integer,provider text,status text,updated_at timestamptz,
        primary key(backfill_id,media_item_id,provider));
      insert into game_company_backfill_items select 1,n,'igdb','pending',now() from generate_series(1,100000) n;
      analyze media_items; analyze game_company_backfill_items;
    `);
    const item = { backfillId: 1, mediaItemId: 1, provider: "igdb" } as Parameters<typeof checkpointGameCompanyItem>[0];
    const oldOwner = { runId: 1, lockToken: "former-owner" };
    await assert.rejects(updateMediaItemCoverThumb({ mediaItemId: 1, expectedCoverUrl: "covers/1.webp", coverThumbUrl: "new-thumb", jobGuard: oldOwner }), /STALE_SNAPSHOT_JOB/);
    await assert.rejects(markMediaItemCoverThumbAttempt({ mediaItemId: 1, expectedCoverUrl: "covers/1.webp", jobGuard: oldOwner }), /STALE_SNAPSHOT_JOB/);
    await assert.rejects(checkpointGameCompanyItem(item, { status: "done" }, undefined, oldOwner), /STALE_SNAPSHOT_JOB/);
    assert.equal((await client`select status from game_company_backfill_items where backfill_id=1 and media_item_id=1 and provider='igdb'`)[0].status, "pending");
    assert.equal((await client`select cover_thumb_url,cover_thumb_attempted_at from media_items where id=1`)[0].cover_thumb_attempted_at, null);
    assert.equal(await updateMediaItemCoverThumb({ mediaItemId: 1, expectedCoverUrl: "covers/1.webp", coverThumbUrl: "new-thumb", jobGuard: guard }), true);
    await checkpointGameCompanyItem(item, { status: "done" }, undefined, guard);
    assert.equal((await client`select status from game_company_backfill_items where backfill_id=1 and media_item_id=1 and provider='igdb'`)[0].status, "done");

    await client`update job_runs set lock_expires_at=clock_timestamp()+interval '250 milliseconds' where id=1`;
    let pending: Promise<unknown> | undefined;
    await client.begin(async blocker => {
      await blocker`select id from media_items where id=2 for update`;
      pending = updateMediaItemCoverThumb({ mediaItemId: 2, expectedCoverUrl: "covers/2.webp", coverThumbUrl: "expired-thumb", jobGuard: guard }).then(
        () => ({ ok: true }), error => ({ error }),
      );
      await delay(400);
    });
    const outcome = await pending as { ok?: boolean; error?: unknown };
    assert.ok(outcome.error, "a mutation waiting beyond its lease must fail");
    assert.equal((await client`select cover_thumb_url from media_items where id=2`)[0].cover_thumb_url, null);

    // Each statement fits within the initial timeout, but the complete transaction
    // exceeds the lease: the final fence must roll back its mutations and cursor.
    await client`update job_runs set lock_expires_at=clock_timestamp()+interval '180 milliseconds' where id=1`;
    await assert.rejects(checkpointPlatformLogoJob(guard, { force: true }, async tx => {
      await tx.execute(sql`update media_items set cover_thumb_url='late-logo-change' where id=3`);
      for (let index = 0; index < 3; index++) await tx.execute(sql`select pg_sleep(0.08)`);
    }), /STALE_SNAPSHOT_JOB/);
    assert.equal((await client`select cover_thumb_url from media_items where id=3`)[0].cover_thumb_url, null);
    assert.deepEqual((await client`select payload from job_runs where id=1`)[0].payload, {});

    // Existing mutation predicates stay compatible with primary keys at representative volume.
    const coverPlan = await client.unsafe("explain (format json) update media_items set cover_thumb_url='probe' where id=50000 and cover_url='covers/50000.webp' and cover_thumb_url is null");
    const checkpointPlan = await client.unsafe("explain (format json) update game_company_backfill_items set status='done' where backfill_id=1 and media_item_id=50000 and provider='igdb'");
    assert.match(JSON.stringify(coverPlan), /Index Scan/);
    assert.match(JSON.stringify(checkpointPlan), /Index Scan/);
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});
