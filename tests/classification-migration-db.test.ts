import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, beforeEach, describe, it } from "node:test";
import postgres from "postgres";
import { getTableColumns, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { authors, jobRuns } from "../src/db/schema";
import { classificationMigrationRuns } from "../src/db/classification-migration-schema";
import { classificationHash, type ClassificationManifest } from "../src/lib/classification-migration/model";
import { classificationManifestFromSelection } from "../src/lib/classification-migration/selection";
import { normalizeSearchSql } from "../src/db/search";

// Owns an ephemeral local container. Never uses an existing DATABASE_URL.
const enabled = process.env.CLASSIFICATION_MIGRATION_DB_TEST === "1";
const container = `zadrotto-classification-test-${process.pid}`;
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
const originalDatabaseUrl = process.env.DATABASE_URL;
let started = false;
let client: ReturnType<typeof postgres>;
let appDb: typeof import("../src/db") | undefined;
let queries: typeof import("../src/db/queries/classification-migration");
const dialect = new PgDialect();
const signal = new AbortController().signal;

function manifest(): ClassificationManifest {
  return { version: 1,
    series: [
      { id: 1, group: "tag", parentId: null },
      { id: 2, group: "keep", parentId: null },
      { id: 3, group: "keep", parentId: 2 },
      { id: 4, group: "keep", parentId: null },
      { id: 5, group: "keep", parentId: 4 },
      { id: 7, group: "tag", parentId: null },
    ],
    pendingLinks: [{ mediaItemId: 15, franchiseId: 1, decision: "discard" }],
    removalRequests: [{ mediaItemId: 10, franchiseId: 1, decision: "discard" }],
  };
}
async function fence(job: { id: number }) {
  const lockToken = `test-${job.id}`;
  await client`update job_runs set status='running',lock_token=${lockToken},lock_expires_at=clock_timestamp()+interval '1 hour' where id=${job.id}`;
  return { runId: job.id, lockToken };
}
async function previewAndApprove() {
  const run = await queries.createClassificationPreview(manifest(), 500);
  assert.deepEqual(run.preview.blockers, []);
  const job = await queries.approveClassificationMigration(run.id, run.previewHash, 500);
  return { run, guard: await fence(job) };
}

describe("confirmed classification migration on disposable PostgreSQL", { skip: !enabled }, () => {
  before(async () => {
    docker("run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=classification-test", "-p", "127.0.0.1::5432", "postgres:18");
    started = true;
    const port = Number(docker("port", container, "5432/tcp").split(":").at(-1));
    client = postgres({ host: "127.0.0.1", port, username: "postgres", password: "classification-test", database: "postgres", max: 4, connect_timeout: 2, onnotice() {} });
    for (let attempt = 0; ; attempt += 1) {
      try { await client`select 1`; break; }
      catch (error) { if (attempt >= 40) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    process.env.DATABASE_URL = `postgres://postgres:classification-test@127.0.0.1:${port}/postgres`;
    appDb = await import("../src/db");
    queries = await import("../src/db/queries/classification-migration");
    const columns = (table: Parameters<typeof getTableColumns>[0]) => Object.values(getTableColumns(table)).map(column => `"${column.name}" ${column.getSQLType()}`).join(",");
    await client.unsafe(`
      create table authors(${columns(authors)}, primary key(id));
      create table job_runs(${columns(jobRuns)});
      alter table job_runs alter column status set default 'queued';
      create table classification_migration_runs(${columns(classificationMigrationRuns)}, primary key(id));
      alter table classification_migration_runs alter column id set default gen_random_uuid();
      alter table classification_migration_runs alter column status set default 'preview';
      alter table classification_migration_runs alter column created_at set default now();
      create table archive_settings(id int primary key,tag_publication_threshold int,max_franchise_depth int);
      create table franchises(id serial primary key,parent_id int references franchises(id) on delete restrict,code text unique,title text,publication_status text);
      create table media_items(id int primary key,media_type text,publication_status text,created_by_author_id int references authors(id));
      create table entry_sources(source_series_id int references franchises(id) on delete cascade);
      create table tags(id serial primary key,code text unique,title text);
      create table media_item_tags(media_item_id int references media_items(id),tag_id int references tags(id) on delete restrict,author_id int references authors(id),primary key(media_item_id,tag_id,author_id));
      create table media_item_franchises(media_item_id int references media_items(id),franchise_id int references franchises(id) on delete cascade,publication_status text,primary key(media_item_id,franchise_id));
      create table media_item_franchise_removal_requests(media_item_id int,franchise_id int,requested_by_author_id int,primary key(media_item_id,franchise_id),foreign key(media_item_id,franchise_id) references media_item_franchises on delete cascade);
      create table genres(id int primary key,replacement_franchise_id int references franchises(id) on delete set null,replacement_tag_id int references tags(id));
      create table achievements(id int primary key,code text,mechanic text,params jsonb);
      create table achievement_levels(id int primary key,achievement_id int references achievements(id),threshold int);
      create table user_achievements(id int primary key,author_id int references authors(id),achievement_level_id int references achievement_levels(id));
      create table ratings(author_id int references authors(id),media_item_id int references media_items(id),primary key(author_id,media_item_id));
      create table contributions(id int primary key,author_id int references authors(id),primary_media_item_id int references media_items(id),type text,status text);
      create table provider_snapshot_links(snapshot_id int,entity_type text,entity_id text,purpose text);
    `);
    const index = dialect.sqlToQuery(sql`create unique index tags_title_unique on tags (${normalizeSearchSql(sql`title`)})`);
    await client.unsafe(index.sql, index.params as never);
  });
  after(async () => {
    if (appDb) await appDb.getDbClient().end({ timeout: 2 });
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabaseUrl;
    if (client) await client.end({ timeout: 2 });
    if (started) docker("stop", container);
  });
  beforeEach(async () => {
    await client.unsafe(`
      truncate classification_migration_runs,job_runs,archive_settings,authors,franchises,media_items,tags,media_item_tags,media_item_franchises,media_item_franchise_removal_requests,genres,achievements,achievement_levels,user_achievements,ratings,contributions,provider_snapshot_links restart identity cascade;
      insert into authors(id,is_system) values(1,false),(2,false),(99,true);
      insert into archive_settings values(1,3,5);
      insert into franchises values(1,null,'theme','Тема','published'),(2,1,'real','Настоящая франшиза','published'),(3,2,'child','Потомок','published'),(4,1,'pending','Скрытая ветка','pending'),(5,4,'blocked','Скрытый потомок','published'),(7,2,'nested','Вложенная тема','published');
      insert into media_items values(10,'game','published',1),(11,'game','published',1),(12,'book','published',2),(13,'game','published',1),(14,'game','published',1),(15,'game','published',2);
      insert into media_item_franchises values(10,1,'published'),(10,2,'published'),(11,2,'published'),(12,3,'published'),(13,5,'published'),(14,7,'published'),(15,1,'pending');
      insert into media_item_franchise_removal_requests values(10,1,2);
      insert into genres values(30,1,null);
      insert into tags(id,code,title) values(50,'existing','Существующий тег');
      select setval(pg_get_serial_sequence('tags','id'),50);
      insert into media_item_tags values(15,50,1);
      insert into achievements values(1,'rated','rating.authored.count','{"seriesId":1}'),(2,'reviewed','review.authored.count','{"seriesId":1,"mediaType":"game"}'),(3,'created','media.authored.count','{"seriesId":1}'),(4,'real-child','rating.authored.count','{"seriesId":3}');
      insert into achievement_levels values(100,1,2),(101,2,1);
      insert into user_achievements values(1000,1,100);
      insert into ratings values(1,10),(1,11),(1,12),(1,14),(2,12);
      insert into contributions values(1,1,10,'review','published'),(2,1,10,'review','published'),(3,1,11,'review','published'),(4,2,12,'review','published'),(5,2,14,'review','draft');
    `);
  });

  it("blocks conversion while a series is used as a source", async () => {
    const input = manifest();
    const series = input.series.find((row) => row.group === "tag")!;
    await client`insert into entry_sources values (${series.id})`;
    try {
      const run = await queries.createClassificationPreview(input, 500);
      assert.ok((run.preview.blockers as string[]).some((row) => row.includes("первоисточник")));
    } finally {
      await client`delete from entry_sources where source_series_id = ${series.id}`;
    }
  });

  it("applies nested published membership exactly, preserves identities/grants/user assignments and rolls back", async () => {
    const original = await queries.getClassificationInventory();
    const { run, guard } = await previewAndApprove();
    const payload = { migrationId: run.id, previewHash: run.previewHash };
    await queries.executeClassificationMigration(payload, "apply", guard, signal);
    await queries.executeClassificationMigration(payload, "apply", guard, signal);
    assert.deepEqual((await client`select id,code from franchises order by id`).map(row => [row.id,row.code]), [[2,"real"],[3,"child"],[4,"pending"],[5,"blocked"]]);
    assert.deepEqual((await client`select a.media_item_id,t.code,a.author_id from media_item_tags a join tags t on t.id=a.tag_id order by t.code,a.media_item_id`).map(row => [row.media_item_id,row.code,row.author_id]), [[15,"existing",1],[14,"nested",99],[10,"theme",99],[11,"theme",99],[12,"theme",99],[14,"theme",99]]);
    assert.equal((await client`select params from achievements where id=1`)[0].params.seriesId, undefined);
    assert.equal((await client`select params from achievements where id=4`)[0].params.seriesId, 3);
    assert.deepEqual((await client`select * from user_achievements`).map(row => [row.id,row.author_id,row.achievement_level_id]), [[1000,1,100]]);
    assert.deepEqual((await client`select * from achievement_levels order by id`).map(row => [row.id,row.threshold]), [[100,2],[101,1]]);
    assert.equal((await client`select replacement_franchise_id from genres`)[0].replacement_franchise_id, null);
    assert.ok((await client`select replacement_tag_id from genres`)[0].replacement_tag_id);
    assert.equal(await queries.getMigratedSeriesTagCode("theme"), "theme");
    assert.equal(await queries.getMigratedSeriesTagCode("real"), null);
    const backfills = await client`select payload from job_runs where type='achievements.backfill'`;
    assert.equal(backfills.length, 1);
    assert.deepEqual(backfills[0].payload.achievementIds, [1,2,3]);
    assert.equal(backfills[0].payload.awardGroupId, undefined);
    const rollbackJob = await queries.requestClassificationRollback(run.id, run.previewHash, 500);
    await queries.executeClassificationMigration(payload, "rollback", await fence(rollbackJob), signal);
    assert.equal(classificationHash((await queries.getClassificationInventory()).state), classificationHash(original.state));
    assert.equal(await queries.getMigratedSeriesTagCode("theme"), null);
    assert.equal((await queries.getClassificationMigration(run.id))?.status, "rolled_back");
    await client`delete from job_runs`;
    assert.ok(await queries.getClassificationMigration(run.id));
  });

  it("rolls back a journal written before creator-series links were removed", async () => {
    const original = await queries.getClassificationInventory();
    const { run, guard } = await previewAndApprove();
    await queries.executeClassificationMigration({ migrationId: run.id, previewHash: run.previewHash }, "apply", guard, signal);
    const applied = await queries.getClassificationInventory();
    const oldSnapshot = (state: typeof original.state, seriesId: number) => ({
      ...state,
      creator_series: [{ creator_id: 40, series_id: seriesId }],
      foreignKeys: [{ table_name: "creator_series" }, ...state.foreignKeys],
    });
    const before = oldSnapshot(original.state, 1);
    const after = oldSnapshot(applied.state, 2);
    const oldManifest = { ...run.manifest, creatorLinks: [{ creatorId: 40, seriesId: 1, targetSeriesId: 2 }] };
    const previewHash = classificationHash({
      manifest: oldManifest,
      currentHash: classificationHash({ state: before, proof: original.proof }),
    });
    const afterHash = classificationHash({ state: after, proof: applied.proof });
    await client`update classification_migration_runs set
      manifest=${JSON.stringify(oldManifest)}::jsonb,
      before_snapshot=${JSON.stringify(before)}::jsonb, after_snapshot=${JSON.stringify(after)}::jsonb,
      preview_hash=${previewHash}, after_hash=${afterHash}
      where id=${run.id}`;
    const rollbackJob = await queries.requestClassificationRollback(run.id, previewHash, 500);
    await queries.executeClassificationMigration({ migrationId: run.id, previewHash }, "rollback", await fence(rollbackJob), signal);
    assert.equal((await queries.getClassificationInventory()).hash, original.hash);
    assert.equal((await client`select to_regclass('creator_series') as legacy`)[0].legacy, null);
  });

  it("converts successive batches from the current tree without showing or duplicating retired series", async () => {
    const first = await previewAndApprove();
    const firstPayload = { migrationId: first.run.id, previewHash: first.run.previewHash };
    await queries.executeClassificationMigration(firstPayload, "apply", first.guard, signal);
    const current = await queries.getClassificationInventory();
    assert.deepEqual(current.state.franchises.map(row => Number(row.id)), [2, 3, 4, 5]);
    const form = new FormData();
    for (const id of [2, 4, 5]) form.append("keepSeriesId", String(id));
    const nextManifest = classificationManifestFromSelection(current.state, form);
    assert.deepEqual(nextManifest.series.filter(row => row.group === "tag").map(row => row.id), [3]);
    const next = await queries.createClassificationPreview(nextManifest, 500, current.hash);
    assert.deepEqual(next.preview.blockers, []);
    const job = await queries.approveClassificationMigration(next.id, next.previewHash, 500);
    const guard = await fence(job);
    const payload = { migrationId: next.id, previewHash: next.previewHash };
    await queries.executeClassificationMigration(payload, "apply", guard, signal);
    const after = await queries.getClassificationInventory();
    assert.deepEqual(after.state.franchises.map(row => Number(row.id)), [2, 4, 5]);
    assert.equal(await queries.getMigratedSeriesTagCode("theme"), "theme");
    assert.equal(await queries.getMigratedSeriesTagCode("nested"), "nested");
    assert.equal(await queries.getMigratedSeriesTagCode("child"), "child");
    assert.equal((await client`select params from achievements where id=4`)[0].params.seriesId, undefined);
    assert.equal((await queries.listClassificationMigrations()).filter(row => row.status === "applied").length, 2);
    await queries.executeClassificationMigration(firstPayload, "apply", first.guard, signal);
    await queries.executeClassificationMigration(payload, "apply", guard, signal);
    assert.deepEqual((await queries.getClassificationInventory()).state, after.state);
    await assert.rejects(queries.requestClassificationRollback(first.run.id, first.run.previewHash, 500), /изменились/);
  });

  it("blocks unapproved execution and stale approval/apply without partial mutations", async () => {
    const current = await queries.getClassificationInventory();
    await assert.rejects(queries.createClassificationPreview(manifest(), 500, "0".repeat(64)), /Данные изменились/);
    assert.equal((await client`select count(*)::int as count from classification_migration_runs`)[0].count, 0);
    const accepted = await queries.createClassificationPreview(manifest(), 500, current.hash);
    assert.ok(accepted.id);
    const run = await queries.createClassificationPreview(manifest(), 500);
    await client`insert into job_runs(type,status,lock_token,lock_expires_at) values('classification.apply','running','test',clock_timestamp()+interval '1 hour')`;
    const [job] = await client`select id from job_runs limit 1`;
    await assert.rejects(queries.executeClassificationMigration({ migrationId: run.id, previewHash: run.previewHash }, "apply", { runId: job.id, lockToken: "test" }, signal), /подтверждение/);
    await client`update franchises set title='Изменено' where id=2`;
    await assert.rejects(queries.approveClassificationMigration(run.id, run.previewHash, 500), /изменились/);
    const next = await previewAndApprove();
    await client`insert into ratings values(2,10)`;
    await assert.rejects(queries.executeClassificationMigration({ migrationId: next.run.id, previewHash: next.run.previewHash }, "apply", next.guard, signal), /устарел/);
    assert.equal((await client`select count(*)::int as count from franchises`)[0].count, 6);
    assert.equal((await client`select count(*)::int as count from tags`)[0].count, 1);
  });

  it("blocks changed retained ancestor achievement membership at preview", async () => {
    await client`insert into achievements values(5,'ancestor','rating.authored.count','{"seriesId":2}')`;
    const run = await queries.createClassificationPreview(manifest(), 500);
    assert.ok((run.preview.blockers as string[]).some(row => row.includes("#5")));
    await assert.rejects(queries.approveClassificationMigration(run.id, run.previewHash, 500), /#5/);
  });

  it("explicitly matches existing tags, deduplicates system assignments and resolves retired codes", async () => {
    // Existing community votes remain private; the chosen target gains exact old branch membership.
    await client`update tags set title='ТЕМА' where id=50`;
    await client`delete from media_item_tags`;
    await client`insert into media_item_tags values(10,50,1),(14,50,99)`;
    const input = manifest(); input.series[0].tagId = 50;
    const run = await queries.createClassificationPreview(input, 500);
    assert.deepEqual(run.preview.blockers, []);
    const job = await queries.approveClassificationMigration(run.id, run.previewHash, 500);
    const payload = { migrationId: run.id, previewHash: run.previewHash };
    const original = (await queries.getClassificationInventory()).state;
    await queries.executeClassificationMigration(payload, "apply", await fence(job), signal);
    assert.equal((await client`select params->>'tagId' as tag from achievements where id=1`)[0].tag, "50");
    assert.equal((await client`select count(*)::int as count from tags where title='ТЕМА'`)[0].count, 1);
    assert.equal((await client`select count(*)::int as count from media_item_tags where media_item_id=14 and tag_id=50 and author_id=99`)[0].count, 1);
    assert.equal((await client`select count(*)::int as count from media_item_tags where author_id=1 and tag_id=50`)[0].count, 1);
    assert.equal(await queries.getMigratedSeriesTagCode("theme"), "existing");
    await client`update tags set code='renamed-target' where id=50`;
    assert.equal(await queries.getMigratedSeriesTagCode("theme"), "renamed-target");
    await client`update tags set code='existing' where id=50`;
    const rollback = await queries.requestClassificationRollback(run.id, run.previewHash, 500);
    await queries.executeClassificationMigration(payload, "rollback", await fence(rollback), signal);
    assert.equal(classificationHash((await queries.getClassificationInventory()).state), classificationHash(original));
  });

  it("blocks matching that broadens converted or existing tag achievements", async () => {
    await client`insert into media_item_tags values(15,50,99)`;
    const input = manifest(); input.series[0].tagId = 50; input.series[5].tagId = 50;
    let run = await queries.createClassificationPreview(input, 500);
    assert.ok((run.preview.blockers as string[]).some(row => row.includes("#1")));
    await client`insert into achievements values(9,'existing-tag','rating.authored.count','{"tagId":50}')`;
    input.series[5].tagId = undefined;
    run = await queries.createClassificationPreview(input, 500);
    assert.ok((run.preview.blockers as string[]).some(row => row.includes("#9")));
  });

  it("maps two explicitly approved equivalent topics to one existing tag", async () => {
    await client`insert into media_item_franchises values(10,7,'published'),(11,7,'published'),(12,7,'published')`;
    await client`insert into achievements values(8,'nested-achievement','rating.authored.count','{"seriesId":7}')`;
    const input = manifest(); input.series[0].tagId = 50; input.series[5].tagId = 50;
    const run = await queries.createClassificationPreview(input, 500);
    assert.deepEqual(run.preview.blockers, []);
    const job = await queries.approveClassificationMigration(run.id, run.previewHash, 500);
    await queries.executeClassificationMigration({ migrationId: run.id, previewHash: run.previewHash }, "apply", await fence(job), signal);
    assert.equal((await client`select count(*)::int as count from tags`)[0].count, 1);
    assert.equal((await client`select count(*)::int as count from media_item_tags where author_id=99 and tag_id=50`)[0].count, 4);
    assert.equal(await queries.getMigratedSeriesTagCode("theme"), "existing");
    assert.equal(await queries.getMigratedSeriesTagCode("nested"), "existing");
  });

  it("blocks missing manual decisions, provider links and unknown FK dependencies", async () => {
    const missing = manifest(); missing.pendingLinks = []; missing.removalRequests = [];
    let run = await queries.createClassificationPreview(missing, 500);
    assert.ok((run.preview.blockers as string[]).some(row => row.includes("неопубликованные")));
    assert.ok((run.preview.blockers as string[]).some(row => row.includes("заявки")));
    await client`insert into provider_snapshot_links values(1,'series','1','primary')`;
    await client.unsafe("create table unrecognized_dependency(series_id int references franchises(id)); insert into unrecognized_dependency values(1)");
    try {
      run = await queries.createClassificationPreview(manifest(), 500);
      assert.ok((run.preview.blockers as string[]).some(row => row.includes("снимки")));
      assert.ok((run.preview.blockers as string[]).some(row => row.includes("неизвестная внешняя")));
      await assert.rejects(queries.approveClassificationMigration(run.id, run.previewHash, 500));
      assert.equal((await client`select count(*)::int as count from franchises`)[0].count, 6);
    } finally { await client.unsafe("drop table unrecognized_dependency"); }
  });

  it("rejects a lost worker lease before mutation", async () => {
    const { run, guard } = await previewAndApprove();
    await client`update job_runs set lock_token='replacement-worker' where id=${guard.runId}`;
    await assert.rejects(queries.executeClassificationMigration({ migrationId: run.id, previewHash: run.previewHash }, "apply", guard, signal), /STALE_SNAPSHOT_JOB/);
    assert.equal((await client`select count(*)::int as count from franchises`)[0].count, 6);
    assert.equal((await client`select count(*)::int as count from tags`)[0].count, 1);
  });

  it("refuses rollback after a user assignment drift, retaining the assignment and all grants", async () => {
    const { run, guard } = await previewAndApprove();
    const payload = { migrationId: run.id, previewHash: run.previewHash };
    await queries.executeClassificationMigration(payload, "apply", guard, signal);
    const [tag] = await client`select id from tags where code='theme'`;
    await client`insert into media_item_tags values(10,${tag.id},2)`;
    await assert.rejects(queries.requestClassificationRollback(run.id, run.previewHash, 500), /изменились/);
    assert.equal((await client`select count(*)::int as count from user_achievements`)[0].count, 1);
    assert.equal((await client`select count(*)::int as count from media_item_tags where author_id=2`)[0].count, 1);
  });

  it("rolls back every write if post-apply progress differs", async () => {
    const { run, guard } = await previewAndApprove();
    // A trigger models an unexpected writer not represented by the migration plan.
    await client.unsafe(`create function test_progress_drift() returns trigger language plpgsql as $$ begin delete from ratings where author_id=1 and media_item_id=10; return new; end $$;
      create trigger test_progress_drift after insert on tags for each row execute function test_progress_drift()`);
    try {
      await assert.rejects(queries.executeClassificationMigration({ migrationId: run.id, previewHash: run.previewHash }, "apply", guard, signal), /прогресс/);
    } finally {
      await client.unsafe("drop trigger test_progress_drift on tags; drop function test_progress_drift()");
    }
    assert.equal((await client`select count(*)::int as count from franchises`)[0].count, 6);
    assert.equal((await client`select count(*)::int as count from tags`)[0].count, 1);
    assert.equal((await client`select count(*)::int as count from ratings where author_id=1 and media_item_id=10`)[0].count, 1);
    assert.equal((await queries.getClassificationMigration(run.id))?.status, "approved");
  });
});
