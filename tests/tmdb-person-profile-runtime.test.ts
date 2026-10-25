import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { creatorProfileDescriptor } from "../src/lib/providers/creator-profile-targets";
const testUrl = process.env.TMDB_DIRECTORS_TEST_DATABASE_URL;

test("TMDB person raw, dates and portrait commits preserve manual data and reject stale results", { skip: !testUrl }, async t => {
  const schema = `tmdb_person_profile_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { getDbClient } = await import("../src/db");
  const snapshots = await import("../src/db/queries/provider-snapshots");
  const profiles = await import("../src/db/queries/creator-profile-snapshots");
  const dates = await import("../src/db/queries/creator-provider-snapshots");
  const { fillCreatorImage } = await import("../src/lib/creators/image-fill");
  const client = getDbClient();
  try {
    await client.unsafe(`create schema ${schema};
      create table creator_types(id integer primary key,name text,code text);
      insert into creator_types values(1,'Person','person'),(2,'Organization','organization');
      create table creators(id integer primary key,name text,slug text,original_name text,type_id integer,
        birth_date date,death_date date,avatar_object_key text,avatar_source text,avatar_source_external_id text,
        avatar_source_url text,avatar_original_url text,avatar_fetched_at timestamptz,avatar_content_hash text,
        avatar_version integer default 0,created_at timestamptz default now(),updated_at timestamptz default now(),name_ru text,name_ru_source text,name_ru_processed boolean default false);
      create table creator_relations(source_creator_id integer,target_creator_id integer,relation_type text);
      create table provider_creator_bindings(id integer primary key,provider text,external_creator_id text,
        creator_id integer references creators(id),active boolean default true,external_creator_name text,
        created_at timestamptz default now(),updated_at timestamptz default now());
      create unique index binding_identity on provider_creator_bindings(provider,external_creator_id) where active;
      create table job_runs(id integer primary key,status text,lock_token text,lock_expires_at timestamptz,payload jsonb,updated_at timestamptz default now());
      insert into creators(id,name,slug,type_id,birth_date) values(1,'Manual name','manual',1,'1901-01-01'),(2,'Other','other',2,null);
      insert into provider_creator_bindings(id,provider,external_creator_id,creator_id) values(1,'tmdb','person:17',1);`);
    for (const statement of readFileSync("drizzle/0127_provider_snapshots.sql", "utf8").split("--> statement-breakpoint").slice(0, 4)) await client.unsafe(statement);
    const target = { provider: "tmdb", resourceType: "person", externalId: "17" } as const;
    const save = () => snapshots.saveProviderSnapshot({ ...creatorProfileDescriptor(target), payload: { id: 17, name: "Provider name", birthday: "1900-01-01", deathday: "2000-01-01", profile_path: "/portrait.jpg" }, payloadHash: "", contentType: "application/json", requestStartedAt: new Date(), fetchedAt: new Date() });
    let snapshot = await save();
    const input = () => ({ creatorId: 1, bindingId: 1, externalId: "person:17", provider: "tmdb" as const, process: true, ref: { id: snapshot.id, payloadHash: snapshot.payloadHash } });
    await t.test("raw linking leaves working data intact; date application only fills empty fields and compares TMDB", async () => {
      await profiles.attachCreatorProfileSnapshot({ creatorId: 1, bindingId: 1, ref: input().ref });
      assert.equal((await client`select death_date from creators where id=1`)[0].death_date, null);
      const comparison = await dates.getCreatorSnapshotComparison(1, "tmdb");
      assert.deepEqual(comparison?.changes, { deathDate: "2000-01-01" });
      await dates.commitCreatorSnapshot(input()); await dates.commitCreatorSnapshot(input());
      const [row] = await client`select name,birth_date::text,death_date::text from creators where id=1`;
      assert.deepEqual(row, { name: "Manual name", birth_date: "1901-01-01", death_date: "2000-01-01" });
    });
    await t.test("pseudonyms do not receive life dates", async () => {
      await client`update creators set death_date=null where id=1`;
      await client`insert into creator_relations values(1,2,'pseudonym_of')`;
      assert.deepEqual((await dates.commitCreatorSnapshot(input())).diagnostics, ["pseudonym-skipped"]);
      assert.equal((await client`select death_date from creators where id=1`)[0].death_date, null);
      await client`delete from creator_relations`;
    });
    await t.test("changed hash, inactive identity and expired lease prevent field commits", async () => {
      await assert.rejects(dates.commitCreatorSnapshot({ ...input(), ref: { ...input().ref, payloadHash: "stale" } }), /PROVIDER_SNAPSHOT_CHANGED/);
      await client`update provider_creator_bindings set active=false where id=1`;
      await assert.rejects(dates.commitCreatorSnapshot(input()), /PROVIDER_SOURCE_CHANGED/);
      await client`update provider_creator_bindings set active=true where id=1`;
      await client`insert into job_runs values(1,'running','lease',now()-interval '1 minute','{}',now())`;
      await assert.rejects(dates.commitCreatorSnapshot({ ...input(), jobGuard: { runId: 1, lockToken: "lease" } }), /STALE_SNAPSHOT_JOB/);
    });
    let uploads = 0; const cleaned: (string | null)[] = [];
    let afterUpload: () => Promise<void> = async () => {};
    const dependencies = {
      fetchImage: async () => ({ ok: true as const, body: Buffer.from("image"), contentType: "image/jpeg" }),
      fetchProfile: async () => snapshot,
      portrait: async () => Buffer.from("processed"),
      upload: async () => { uploads++; await afterUpload(); return { objectKey: `new-${uploads}`, contentHash: "hash" }; },
      cleanup: async (key: string | null) => { cleaned.push(key); },
    };
    const sync = () => fillCreatorImage(1, new AbortController().signal, { refreshBindingId: 1 }, dependencies);
    await t.test("manual and other source portraits never trigger image IO", async () => {
      for (const source of ["manual", "fantlab"]) { await client`update creators set avatar_object_key='old',avatar_source=${source} where id=1`; await sync(); }
      assert.equal(uploads, 0);
      await client`update creators set avatar_object_key=null,avatar_source=null where id=1`;
    });
    await t.test("portrait version race cleans newly uploaded object and keeps manual image", async () => {
      afterUpload = async () => { await client`update creators set avatar_source='manual',avatar_object_key='manual',avatar_version=avatar_version+1 where id=1`; };
      await sync();
      assert.equal((await client`select avatar_object_key from creators where id=1`)[0].avatar_object_key, "manual");
      assert.ok(cleaned.includes("new-1"));
      await client`update creators set avatar_source=null,avatar_object_key=null where id=1`;
    });
    await t.test("snapshot race rejects portrait and removes unused image", async () => {
      afterUpload = async () => { await client`update provider_snapshots set payload_hash='changed' where id=${snapshot.id}`; };
      await assert.rejects(sync(), /PROVIDER_SNAPSHOT_CHANGED/);
      assert.ok(cleaned.includes("new-2"));
      snapshot = await save();
    });
    await t.test("profile detached during image upload cannot apply portrait", async () => {
      const before = (await client`select avatar_version from creators where id=1`)[0].avatar_version;
      afterUpload = async () => { await client`delete from provider_snapshot_links where entity_type='creator' and entity_id='1' and snapshot_id=${snapshot.id}`; };
      await sync();
      const [row] = await client`select avatar_object_key,avatar_version from creators where id=1`;
      assert.equal(row.avatar_object_key, null);
      assert.equal(row.avatar_version, before);
      assert.ok(cleaned.includes(`new-${uploads}`));
      await profiles.attachCreatorProfileSnapshot({ creatorId: 1, bindingId: 1, ref: input().ref });
    });
    await t.test("confirmed current portrait stores provider identity and version", async () => {
      afterUpload = async () => {};
      await sync();
      const [row] = await client`select avatar_source,avatar_source_external_id,avatar_object_key,avatar_content_hash from creators where id=1`;
      assert.deepEqual(row, { avatar_source: "tmdb", avatar_source_external_id: "person:17", avatar_object_key: `new-${uploads}`, avatar_content_hash: createHash("sha256").update("processed").digest("hex") });
    });
  } finally { await client.unsafe(`drop schema ${schema} cascade`); await client.end(); }
});
