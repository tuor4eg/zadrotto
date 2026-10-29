import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("part snapshots preserve bindings and isolate parent records", { skip: process.env.PROVIDER_PART_SNAPSHOT_TEST !== "1" }, async () => {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env.DATABASE_URL!, { max: 3, prepare: false });
  try {
    await client.unsafe(`create table media_items(id integer primary key, created_by_author_id integer, publication_status text);
      create table title_parts(id integer primary key, media_item_id integer not null references media_items(id), unique(media_item_id,id));
      create table job_runs(id integer primary key,status text,lock_token text,lock_expires_at timestamptz);
      insert into media_items values (1,null,'published'),(2,null,'published');
      insert into title_parts values (10,1),(20,2);
      insert into job_runs values (1,'running','expired',now()-interval '1 second');`);
    const migration = await readFile("drizzle/0127_provider_snapshots.sql", "utf8");
    await client.unsafe(migration.split("ALTER TABLE entry_creator_sources")[0].replaceAll("--> statement-breakpoint", ""));
    await client.unsafe((await readFile("drizzle/0150_provider_part_snapshots.sql", "utf8")).replaceAll("--> statement-breakpoint", ""));
    const core = await import("../src/db/queries/provider-snapshots");
    const actor = { kind: "system" } as const;
    const raw = { providerCode: "example", resourceType: "issue", externalId: "42", apiMethod: "detail", requestParams: {}, payload: { value: 1 }, payloadHash: "", contentType: "application/json", requestStartedAt: new Date("2026-01-02"), fetchedAt: new Date("2026-01-02") };
    const first = await core.savePartProviderSnapshot(1, raw, actor);
    await core.bindPartProviderSnapshot(1, first.id, 10, actor);
    await Promise.all([
      core.savePartProviderSnapshot(1, { ...raw, payload: { value: 2 }, requestStartedAt: new Date("2026-01-03") }, actor),
      core.savePartProviderSnapshot(1, { ...raw, payload: { value: 0 }, requestStartedAt: new Date("2026-01-01") }, actor),
    ]);
    const [saved] = await core.getPartProviderSnapshots(1, { providerCode: "example", externalId: "42" });
    assert.equal(saved.partId, 10);
    assert.deepEqual(saved.snapshot.payload, { value: 2 });
    await core.savePartProviderSnapshot(1, { ...raw, apiMethod: "other" }, actor);
    await Promise.all([
      core.bindPartProviderSnapshot(1, first.id, 10, actor),
      core.savePartProviderSnapshot(1, { ...raw, requestStartedAt: new Date("2026-01-04") }, actor),
    ]);
    assert.equal((await core.getPartProviderSnapshots(1)).find(row => row.snapshot.id === first.id)?.partId, 10);
    await core.savePartProviderSnapshot(2, raw, actor);
    assert.equal((await core.getPartProviderSnapshots(1, { providerCode: "example", externalId: "42" })).length, 2);
    assert.equal((await core.getPartProviderSnapshots(1, { providerCode: "other", externalId: "42" })).length, 0);
    assert.equal((await core.getPartProviderSnapshots(2)).length, 1);
    await assert.rejects(core.bindPartProviderSnapshot(1, first.id, 20, actor), /SNAPSHOT_PART_NOT_FOUND/);
    await assert.rejects(core.savePartProviderSnapshot(999, raw, actor), /SNAPSHOT_ENTITY_NOT_FOUND/);
    await assert.rejects(core.savePartProviderSnapshot(1, { ...raw, externalId: "guard" }, actor, { runId: 1, lockToken: "expired" }), /STALE_SNAPSHOT_JOB/);
    await client`delete from title_parts where id=10`;
    assert.equal((await core.getPartProviderSnapshots(1, { providerCode: "example", externalId: "42" })).find(row => row.snapshot.id === first.id)?.partId, null);
    await client`delete from media_items where id=1`;
    assert.equal((await core.getPartProviderSnapshots(1)).length, 0);
    assert.equal((await core.getPartProviderSnapshots(2)).length, 1);
    assert.ok(await core.getProviderSnapshot(raw));
    const [plan] = await client.unsafe("explain (format json) select s.id from provider_part_snapshot_links l join provider_snapshots s on s.id=l.snapshot_id where l.media_item_id=1 and s.provider_code='example' and s.external_id='42'");
    assert.ok(plan["QUERY PLAN"]);
  } finally {
    await client.end();
    const { getDbClient } = await import("../src/db");
    await getDbClient().end();
  }
});
