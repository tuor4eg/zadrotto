import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getPgDumpConnection, writeDatabaseDump } from "../src/lib/admin-exports/pg-dump";
import { JobError } from "../src/lib/jobs/types";

const testUrl = process.env.DATABASE_DUMP_TEST_DATABASE_URL;

test("complete dump lifecycle, migration, locking, local storage errors and restoration into an empty database", { skip: !testUrl, timeout: 120000 }, async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const sourceName = `dump_source_${suffix}`;
  const restoreName = `dump_restore_${suffix}`;
  const admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
  const sourceUrl = new URL(testUrl!);
  sourceUrl.pathname = `/${sourceName}`;
  const restoreUrl = new URL(testUrl!);
  restoreUrl.pathname = `/${restoreName}`;
  const originalEnv = { ...process.env };
  const directory = await mkdtemp(join(tmpdir(), "dump-db-test-"));
  let source: ReturnType<typeof postgres> | undefined;
  let restored: ReturnType<typeof postgres> | undefined;
  let closeAppDb: (() => Promise<void>) | undefined;
  try {
    await admin.unsafe(`create database "${sourceName}"`);
    await admin.unsafe(`create database "${restoreName}"`);
    source = postgres(sourceUrl.toString(), { max: 1, onnotice: () => {} });
    restored = postgres(restoreUrl.toString(), { max: 1, onnotice: () => {} });
    await migrate(drizzle(source), { migrationsFolder: "drizzle" });
    await source.unsafe(`
      create schema dump_fixture;
      create table dump_fixture.parents (id integer generated always as identity primary key, label text unique not null);
      create table dump_fixture.children (id serial primary key, parent_id integer references dump_fixture.parents(id), payload bytea not null, touched boolean not null default false);
      create function dump_fixture.touch_child() returns trigger language plpgsql as $$ begin NEW.touched := true; return NEW; end $$;
      create trigger child_insert before insert on dump_fixture.children for each row execute function dump_fixture.touch_child();
      create function dump_fixture.double_value(value integer) returns integer language sql as $$ select value * 2 $$;
      create procedure dump_fixture.touch_all() language sql as $$ update dump_fixture.children set touched = true $$;
      create view dump_fixture.labels as select label from dump_fixture.parents;
      insert into dump_fixture.parents (label) values ('Русский текст'), ('Second');
      insert into dump_fixture.children (parent_id,payload) values (1,decode('00ff0a5c','hex'));
      select lo_from_bytea(240001, decode('ff0001','hex'));
    `);
    const [actor] = await source`insert into admin_users (login,password_hash) values ('dump-test','test') returning id`;
    process.env.DATABASE_URL = sourceUrl.toString();
    process.env.ADMIN_EXPORTS_DIR = join(directory, "exports");
    process.env.S3_ENDPOINT = "http://invalid-unused-s3";
    if (process.env.DATABASE_DUMP_TEST_PG_DUMP) {
      await writeFile(join(directory, "pg_dump"), `#!/bin/sh\nexec "${process.env.DATABASE_DUMP_TEST_PG_DUMP}" "$@"\n`, { mode: 0o700 });
      process.env.PATH = `${directory}:${process.env.PATH}`;
    }
    const queries = await import("../src/db/queries/admin-exports");
    const { getDbClient } = await import("../src/db");
    closeAppDb = async () => { await getDbClient().end({ timeout: 2 }); };
    const { generateDatabaseDump } = await import("../src/lib/admin-exports/database-dump");
    const { fetchAdminExportFile, getLocalDumpPath } = await import("../src/lib/admin-exports/storage");
    const exports = await Promise.all(Array.from({ length: 6 }, () => queries.insertDatabaseDumpExport({ adminId: actor.id, expiresAt: new Date(Date.now() + 86400000) })));
    assert.equal(exports.filter((item) => item.created).length, 1);
    assert.equal(new Set(exports.map((item) => item.item.id)).size, 1);
    const item = exports[0].item;
    assert.equal(await queries.getAdminExportForOwner(item.id, actor.id + 1), null);
    assert.equal((await queries.listAdminExports({ adminId: actor.id })).items.length, 1);

    const reserved = await source.reserve();
    try {
      await reserved`select pg_advisory_lock(6433,1)`;
      await assert.rejects(generateDatabaseDump(item.id, new AbortController().signal), (error: unknown) => error instanceof JobError && error.deferSeconds === 30);
      assert.equal((await queries.getAdminExportById(item.id))?.status, "queued");
      await reserved`select pg_advisory_unlock(6433,1)`;
    } finally { reserved.release(); }

    await generateDatabaseDump(item.id, new AbortController().signal);
    const ready = await queries.getAdminExportById(item.id);
    assert.equal(ready?.status, "ready");
    assert.equal(ready?.rowCount, null);
    const response = await fetchAdminExportFile({ objectKey: ready!.objectKey!, entityType: "database_dump" });
    const gzip = Buffer.from(await new Response(response!.body).arrayBuffer());
    assert.equal(gzip.length, ready!.fileSize);
    assert.deepEqual(await readFile(getLocalDumpPath(ready!.objectKey!)), gzip);
    const sql = gunzipSync(gzip);
    assert.match(sql.toString(), /CREATE PROCEDURE dump_fixture.touch_all/);
    assert.match(sql.toString(), /CREATE VIEW dump_fixture.labels/);
    assert.match(sql.toString(), /CREATE EXTENSION IF NOT EXISTS pg_trgm/);

    await new Promise<void>((resolve, reject) => {
      const connection = getPgDumpConnection(restoreUrl.toString());
      const child = spawn(process.env.DATABASE_DUMP_TEST_PSQL ?? "psql", ["-X", "--set=ON_ERROR_STOP=1", `--dbname=${connection.connectionString}`], { env: { ...process.env, PGPASSWORD: connection.password }, stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (bytes) => { stderr += bytes.toString(); });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Restore failed: ${stderr}`)));
      child.stdin.end(sql);
    });
    assert.deepEqual(await restored`select id,label from dump_fixture.parents order by id`, await source`select id,label from dump_fixture.parents order by id`);
    const [binary] = await restored`select encode(payload,'hex') as value,touched from dump_fixture.children`;
    assert.deepEqual(binary, { value: "00ff0a5c", touched: true });
    const [largeObject] = await restored`select encode(lo_get(240001),'hex') as value`;
    assert.equal(largeObject.value, "ff0001");
    const [next] = await restored`insert into dump_fixture.parents (label) values ('Next') returning id`;
    assert.equal(next.id, 3);
    const [fn] = await restored`select dump_fixture.double_value(4) as value`;
    assert.equal(fn.value, 8);
    await assert.rejects(restored`insert into dump_fixture.parents(label) values ('Next')`, /unique constraint/);
    await assert.rejects(restored`insert into dump_fixture.children(parent_id,payload) values (999,decode('00','hex'))`, /foreign key constraint/);
    const [trigger] = await restored`insert into dump_fixture.children(parent_id,payload,touched) values (3,decode('ff','hex'),false) returning touched`;
    assert.equal(trigger.touched, true);

    const nextExport = await queries.insertDatabaseDumpExport({ adminId: actor.id, expiresAt: new Date(Date.now() + 86400000) });
    const goodDirectory = process.env.ADMIN_EXPORTS_DIR;
    const blockedDirectory = join(directory, "blocked");
    await writeFile(blockedDirectory, "not a directory");
    process.env.ADMIN_EXPORTS_DIR = blockedDirectory;
    await assert.rejects(generateDatabaseDump(nextExport.item.id, new AbortController().signal));
    assert.equal((await queries.getAdminExportById(nextExport.item.id))?.status, "failed");
    process.env.ADMIN_EXPORTS_DIR = goodDirectory;
    assert.equal((await readdir(goodDirectory!)).length, 1);
    await queries.requeueAdminExport(nextExport.item.id, actor.id);
    await generateDatabaseDump(nextExport.item.id, new AbortController().signal);
    assert.equal((await queries.getAdminExportById(nextExport.item.id))?.status, "ready");
    const nextReady = await queries.getAdminExportById(nextExport.item.id);
    await queries.markAdminExportReady({ id: nextExport.item.id, objectKey: nextReady!.objectKey!, rowCount: null, fileSize: 3_000_000_000 });
    assert.equal((await queries.getAdminExportById(nextExport.item.id))?.fileSize, 3_000_000_000);
    const [hasTempFiles] = await source`select count(*)::int as count from admin_exports where status = 'running'`;
    assert.equal(hasTempFiles.count, 0);

    const { createDatabaseDumpExport } = await import("../src/lib/admin-exports/create");
    const queued = await createDatabaseDumpExport(actor.id);
    const duplicate = await createDatabaseDumpExport(actor.id);
    assert.equal(queued.id, duplicate.id);
    const [run] = await source`select type,payload from job_runs where payload->>'exportId' = ${queued.id}`;
    assert.equal(run.type, "admin.export-generate");
    assert.deepEqual(run.payload, { exportId: queued.id });
    await queries.cancelQueuedAdminExport(queued.id, actor.id);
    await generateDatabaseDump(queued.id, new AbortController().signal);
    assert.equal((await readdir(process.env.ADMIN_EXPORTS_DIR!)).length, 2);
    const [cancelled] = await source`select status from job_runs where payload->>'exportId' = ${queued.id}`;
    assert.equal(cancelled.status, "cancelled");
    await source`update admin_exports set expires_at = now() - interval '1 day' where status = 'ready'`;
    const { cleanupAdminExports } = await import("../src/lib/admin-exports/generate");
    assert.equal(await cleanupAdminExports(), 2);
    assert.equal((await readdir(process.env.ADMIN_EXPORTS_DIR!)).length, 0);
    assert.equal((await queries.getAdminExportById(item.id))?.status, "expired");

    // The low-level runner also remains usable independently of the admin queue.
    const extra = join(directory, "extra.sql.gz");
    await writeDatabaseDump({ databaseUrl: sourceUrl.toString(), filePath: extra, executable: process.env.DATABASE_DUMP_TEST_PG_DUMP, signal: new AbortController().signal });
    assert.ok(gunzipSync(await readFile(extra)).length > 0);
  } finally {
    await closeAppDb?.();
    await source?.end({ timeout: 2 });
    await restored?.end({ timeout: 2 });
    await admin.unsafe(`drop database if exists "${sourceName}" with (force)`);
    await admin.unsafe(`drop database if exists "${restoreName}" with (force)`);
    await admin.end({ timeout: 2 });
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    await rm(directory, { recursive: true, force: true });
  }
});
