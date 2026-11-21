import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import postgres from "postgres";
import { getTableColumns } from "drizzle-orm";
import { jobRuns } from "../src/db/schema";

// Explicit opt-in; all reads and writes use a disposable PostgreSQL container.
// FRANCHISE_MANAGEMENT_DB_TEST=1 node --import tsx tests/franchise-management-db.test.ts
const enabled = process.env.FRANCHISE_MANAGEMENT_DB_TEST === "1";
const container = `zadrotto-franchise-access-test-${process.pid}`;
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
const originalDatabaseUrl = process.env.DATABASE_URL;
let client: ReturnType<typeof postgres>;
let appDb: typeof import("../src/db") | undefined;
let items: typeof import("../src/db/queries/media-items");
let franchises: typeof import("../src/db/queries/franchises");
let started = false;

const updateInput = {
  authorId: 1, mediaItemId: 1, title: "Edited by owner", originalTitle: null,
  description: "Changed description", mediaType: "film" as const, franchiseIds: [] as number[],
  mediaCarrierId: null, releaseYear: 2024, coverUrl: null, coverThumbUrl: null,
  coverSource: { provider: null, externalId: null, pageUrl: null },
};

describe("ordinary author franchise management boundaries", { skip: !enabled }, () => {
  before(async () => {
    docker("run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=franchise-access-test", "-p", "127.0.0.1::5432", "postgres:18");
    started = true;
    const port = Number(docker("port", container, "5432/tcp").split(":").at(-1));
    const url = `postgres://postgres:franchise-access-test@127.0.0.1:${port}/postgres`;
    client = postgres(url, { max: 2, connect_timeout: 2, onnotice() {} });
    for (let attempt = 0; ; attempt++) {
      try { await client`select 1`; break; }
      catch (error) {
        if (attempt >= 30) throw error;
        await new Promise((resolve) => setTimeout(resolve,100));
      }
    }
    process.env.DATABASE_URL = url;
    appDb = await import("../src/db");
    items = await import("../src/db/queries/media-items");
    franchises = await import("../src/db/queries/franchises");
    await client.unsafe(`
      create table author_access_profiles(id integer primary key,code text not null);
      create table authors(id integer primary key,access_profile_id integer,is_system boolean,blocked_at timestamptz,merged_into_author_id integer);
      insert into author_access_profiles values(1,'regular');
      insert into authors values(1,1,false,null,null);
      create table media_items(id integer primary key,created_by_author_id integer,publication_status text,title text,
        original_title text,description text,media_type text,media_carrier_id integer,release_year integer,
        cover_url text,cover_thumb_url text,cover_source_provider text,cover_source_external_id text,cover_source_page_url text,
        updated_at timestamptz);
      insert into media_items(id,created_by_author_id,publication_status,title,updated_at)
        values(1,1,'private','Original','2020-01-01T00:00:00Z');
      create table media_item_franchises(media_item_id integer,franchise_id integer,publication_status text,
        created_by_author_id integer,created_at timestamptz,updated_at timestamptz,primary key(media_item_id,franchise_id));
      insert into media_item_franchises values
        (1,10,'published',99,'2019-01-01T00:00:00Z','2021-02-03T04:05:06Z'),
        (1,11,'submitted',2,'2020-01-01T00:00:00Z','2022-03-04T05:06:07Z');
      create function reject_franchise_write() returns trigger language plpgsql as $$
        begin raise exception 'Unexpected franchise write'; end $$;
      create trigger preserve_franchises before insert or update or delete on media_item_franchises
        for each statement execute function reject_franchise_write();
    `);
  });
  after(async () => {
    if (appDb) await appDb.getDbClient().end({ timeout: 2 });
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (client) await client.end({ timeout: 2 });
    if (started) docker("stop",container);
  });

  it("updates the ordinary author's draft without writing or rebuilding existing franchise links", async () => {
    const before = await client`select row_to_json(link)::text as bytes,ctid::text as physical_row from media_item_franchises link order by franchise_id`;
    await items.updateAuthorMediaItem(updateInput);
    assert.equal((await client`select title from media_items where id=1`)[0].title,updateInput.title);
    assert.deepEqual(await client`select row_to_json(link)::text as bytes,ctid::text as physical_row from media_item_franchises link order by franchise_id`,before);
  });

  it("rejects malicious franchiseIds before changing the draft", async () => {
    const before = await client`select row_to_json(item)::text as bytes from media_items item where id=1`;
    await client`create trigger reject_media_write before insert or update or delete on media_items for each statement execute function reject_franchise_write()`;
    try {
      await assert.rejects(items.updateAuthorMediaItem({ ...updateInput,title: "Unauthorized change",franchiseIds: [10] }),/franchise-forbidden/);
    } finally {
      await client`drop trigger reject_media_write on media_items`;
    }
    assert.deepEqual(await client`select row_to_json(item)::text as bytes from media_items item where id=1`,before);
  });

  it("rejects the low-level author link API before any write, including an empty request", async () => {
    const before = await client`select row_to_json(link)::text as bytes from media_item_franchises link order by franchise_id`;
    for (const franchiseIds of [[10],[]]) await assert.rejects(franchises.createAuthorMediaItemFranchiseLinks({ authorId: 1,mediaItemId: 1,franchiseIds,publicationStatus: "published" }),/franchise-forbidden/);
    assert.deepEqual(await client`select row_to_json(link)::text as bytes from media_item_franchises link order by franchise_id`,before);
  });
  it("trusted authors bypass the retired review flag and cannot submit new moderation requests", async () => {
    await client.unsafe(`insert into author_access_profiles values(2,'trusted');
      update authors set access_profile_id=2 where id=1;
      drop trigger preserve_franchises on media_item_franchises;
      create table franchises(id integer primary key,title text);
      insert into franchises values(10,'Published series');
      create table domain_events(id uuid primary key default gen_random_uuid(),type text,schema_version integer,
        actor_author_id integer,aggregate_type text,aggregate_id text,payload jsonb,occurred_at timestamptz default now());
      create table domain_event_outbox(event_id uuid primary key,dispatched_at timestamptz,next_attempt_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now());
      create table job_runs(${Object.values(getTableColumns(jobRuns)).map(column => `"${column.name}" ${column.getSQLType()}`).join(',')});`);
    await assert.rejects(franchises.createAuthorMediaItemFranchiseLinks({ authorId: 1, mediaItemId: 1, franchiseIds: [10], publicationStatus: 'submitted' }), /franchise-review-disabled/);
    await assert.rejects(franchises.createAuthorFranchiseWithMediaItemLink({ authorId: 1, mediaItemId: 1, code: 'new', title: 'New', description: null, originalTitle: null, parentId: null, publicationStatus: 'submitted' }), /franchise-review-disabled/);
    const result = await franchises.requestAuthorMediaItemFranchiseRemoval({ authorId: 1, mediaItemId: 1, franchiseId: 10, canPublishFranchisesWithoutReview: false });
    assert.equal(result?.status, 'removed');
    assert.equal((await client`select * from media_item_franchises where franchise_id=10`).length, 0);
    assert.deepEqual((await client`select type from domain_events`).map(row => row.type), ['media-franchise.removed']);
    assert.equal((await client`select * from domain_event_outbox`).length, 1);
  });

});
