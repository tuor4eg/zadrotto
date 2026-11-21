import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { CREATOR_FILL_FIELDS, type CreatorFieldsFillPayload } from "../src/lib/creators/fields-fill-payload";
import { JobError } from "../src/lib/jobs/types";
import { creatorFillDatesDescriptor, type CreatorProfileTarget } from "../src/lib/providers/creator-profile-targets";
import { snapshotHash } from "../src/lib/providers/snapshot-values";
import type { JSONValue } from "../src/lib/providers/types";

test("creator fields job applies saved snapshots and resumes a fenced scan", {
  skip: process.env.CREATOR_FIELDS_FILL_DB_TEST !== "1",
}, async t => {
  const container = `zadrotto-creator-fields-test-${process.pid}`;
  const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalMaxConnections = process.env.DATABASE_MAX_CONNECTIONS;
  const originalFetch = global.fetch;
  docker("run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=creator-fields-test", "-p", "127.0.0.1::5432", "postgres:18");
  let dbClient: ReturnType<typeof import("../src/db").getDbClient> | undefined;
  t.after(async () => {
    try {
      await dbClient?.end({ timeout: 2 });
    } finally {
      global.fetch = originalFetch;
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalMaxConnections === undefined) delete process.env.DATABASE_MAX_CONNECTIONS;
      else process.env.DATABASE_MAX_CONNECTIONS = originalMaxConnections;
      docker("stop", container);
    }
  });

  // Use the test container even when the application database is configured.
  const port = docker("port", container, "5432/tcp").split(":").at(-1);
  process.env.DATABASE_URL = `postgres://postgres:creator-fields-test@127.0.0.1:${port}/postgres`;
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { getDbClient } = await import("../src/db");
  const client = dbClient = getDbClient();
  for (let attempt = 0; ; attempt += 1) {
    try {
      await client`select 1`;
      break;
    } catch (error) {
      if (attempt >= 40) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  for (const migration of ["0000_baseline", "0013_creator_fields_fill_attempts"]) {
    const sql = await readFile(`drizzle/${migration}.sql`, "utf8");
    await client.begin(async tx => {
      await tx`set local client_min_messages = warning`;
      await tx.unsafe(sql);
    });
  }

  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls += 1;
    throw new Error("Unexpected provider request");
  };
  const { creatorFieldsFillHandler: handler } = await import("../src/lib/creators/fields-fill-job");
  const { saveProviderSnapshot } = await import("../src/db/queries/provider-snapshots");
  const { claimNextJobRun, createJobRun, deferJobRun, finishJobRun, getJobRunById } = await import("../src/db/queries/jobs");
  const batchInput = { fields: [...CREATOR_FILL_FIELDS], fetchMissing: false, force: false };
  let timestamp = Date.now();

  function save(target: CreatorProfileTarget, payload: JSONValue) {
    const time = new Date(timestamp++);
    return saveProviderSnapshot({
      ...creatorFillDatesDescriptor(target), payload, payloadHash: snapshotHash(payload),
      contentType: "application/json", requestStartedAt: time, fetchedAt: time,
    });
  }
  function comic(id: number, dates: Record<string, JSONValue> = {}) {
    return save({ provider: "comic-vine", resourceType: "person", externalId: String(id) }, {
      status_code: 1, results: { id, name: "Provider name", ...dates },
    });
  }
  function enqueue(payload: CreatorFieldsFillPayload) {
    return createJobRun({
      type: handler.type, payload, source: "manual", maxAttempts: 3,
      timeoutSeconds: 60, retryBaseSeconds: 1, retryMaxSeconds: 2,
    });
  }
  async function claim(runId: number, now?: Date) {
    const run = await claimNextJobRun({ lockedBy: "creator-fields-test", now });
    assert.ok(run?.lockToken);
    assert.equal(run.id, runId);
    return { ...run, lockToken: run.lockToken };
  }
  async function execute(run: Awaited<ReturnType<typeof claim>>) {
    await handler.execute({
      payload: handler.parsePayload(run.payload), runId: run.id, lockToken: run.lockToken, jobId: run.jobId,
      source: run.source, attempt: run.attempts, signal: new AbortController().signal,
    });
    const finished = await finishJobRun({ id: run.id, lockToken: run.lockToken, status: "succeeded" });
    assert.ok(finished);
    return handler.parsePayload(finished.payload).progress!;
  }
  async function dates(id: number) {
    const [row] = await client`select birth_date::text, death_date::text, name_ru, name_ru_source from creators where id=${id}`;
    return { ...row };
  }

  await t.test("fills empty fields, reports conflicting evidence and skips unchanged attempts", async () => {
    await client.unsafe(`
      insert into creators(id,type_id,name,slug,name_ru,name_ru_source,birth_date) values
        (1,1,'Local name','local','Ручное имя','manual','1898-05-03'),
        (2,1,'Conflict','conflict',null,null,null),
        (3,1,'Empty','empty',null,null,null),
        (4,3,'Company','company',null,null,null),
        (5,1,'Alias','alias',null,null,null);
      insert into creator_relations(source_creator_id,target_creator_id,relation_type) values(5,1,'pseudonym_of');
      insert into provider_creator_bindings(creator_id,provider,external_creator_id) values
        (1,'comic-vine','person:101'),(2,'comic-vine','person:102'),(2,'anilist','person:202'),
        (3,'comic-vine','person:103'),(4,'igdb','company:104'),(5,'comic-vine','person:105');
    `);
    await comic(101, { birth: "1902-07-12", death: { date: "1990-07-15 23:00:00-05:00" } });
    await comic(102, { birth: "1902-07-12" });
    await comic(103);
    await comic(105, { birth: "1902-07-12" });
    await save({ provider: "anilist", resourceType: "person", externalId: "202" }, {
      id: 202, name: { full: "Conflicting provider name" }, dateOfBirth: { year: 1902, month: 7, day: 13 }, dateOfDeath: null,
    });
    await save({ provider: "igdb", resourceType: "company", externalId: "104" }, {
      id: 104, name: "Provider company name", start_date: Date.UTC(1982, 0, 1) / 1000,
      start_date_format: { format: "YYYYMMDD" },
    });

    const payload = { ...batchInput, creatorIds: [1, 2, 3, 4, 5] };
    const first = await execute(await claim((await enqueue(payload)).id));
    assert.equal(first.processed, 4);
    assert.equal(first.updated, 2);
    assert.equal(first.filled, 2);
    assert.equal(first.missing, 0);
    assert.equal(first.review, 1);
    const conflict = first.details.find(row => row.creatorId === 2);
    assert.match(conflict?.messages.join(" ") ?? "", /ComicVine — 1902-07-12, AniList — 1902-07-13/);
    assert.deepEqual(await dates(1), {
      birth_date: "1898-05-03", death_date: "1990-07-15", name_ru: "Ручное имя", name_ru_source: "manual",
    });
    assert.equal((await dates(2)).birth_date, null);
    assert.equal((await dates(3)).birth_date, null);
    assert.equal((await dates(4)).birth_date, "1982-01-01");
    assert.equal((await dates(4)).death_date, null);
    assert.equal((await dates(5)).birth_date, null);

    const repeat = await execute(await claim((await enqueue(payload)).id));
    assert.equal(repeat.processed, 0);
    assert.deepEqual(repeat.details, []);

    await comic(103, { birth: "1903-07-12" });
    const changed = await execute(await claim((await enqueue(payload)).id));
    assert.equal(changed.processed, 1);
    assert.equal(changed.filled, 1);
    assert.equal((await dates(3)).birth_date, "1903-07-12");
  });

  await t.test("defers after a batch and honors the stored upper bound on resume", async () => {
    await client.unsafe(`
      insert into creators(id,type_id,name,slug) select id,1,'Batch '||id,'batch-'||id from generate_series(10,35) id;
      insert into provider_creator_bindings(creator_id,provider,external_creator_id)
        select id,'comic-vine','person:'||id from generate_series(10,35) id;
    `);
    const { id } = await enqueue({ ...batchInput, batchSize: 20, batchPauseHours: 0.25 });
    const first = await claim(id);
    await assert.rejects(execute(first), (error: unknown) =>
      error instanceof JobError && error.code === "creator-fields-continue" && error.deferSeconds === 900);
    await deferJobRun({
      id, lockToken: first.lockToken, delaySeconds: 900, errorCode: "creator-fields-continue", errorMessage: "Next batch",
    });
    const deferred = await getJobRunById(id);
    assert.ok(deferred);
    assert.equal(deferred.status, "queued");
    await assert.rejects(execute(first), (error: unknown) =>
      error instanceof JobError && error.code === "lease-lost");
    const checkpoint = handler.parsePayload(deferred.payload).progress;
    assert.ok(checkpoint);
    assert.ok(checkpoint.afterId >= 10 && checkpoint.afterId < 35);
    assert.equal(checkpoint.throughId, 35);
    assert.equal(checkpoint.scanned, 20);

    await client.unsafe(`
      insert into creators(id,type_id,name,slug) values(36,1,'Late','late');
      insert into provider_creator_bindings(creator_id,provider,external_creator_id) values(36,'comic-vine','person:36');
    `);
    const complete = await execute(await claim(id, new Date(deferred.availableAt.getTime() + 1)));
    assert.equal(complete.afterId, 35);
    assert.equal(complete.throughId, 35);
    const batchDetails = complete.details.filter(row => row.creatorId >= 10).map(row => row.creatorId);
    assert.deepEqual(batchDetails, Array.from({ length: 26 }, (_, index) => 10 + index));
  });
  await t.test("preserves a manual date committed while the worker waits for the creator lock", async () => {
    await client.unsafe(`
      insert into creators(id,type_id,name,slug) values(37,1,'Concurrent','concurrent');
      insert into provider_creator_bindings(creator_id,provider,external_creator_id) values(37,'comic-vine','person:137');
    `);
    await comic(137, { birth: "1902-07-12", death: { date: "1990-07-15" } });
    const run = await claim((await enqueue({ ...batchInput, creatorIds: [37] })).id);

    let worker: ReturnType<typeof execute> | undefined;
    try {
      await client.begin(async tx => {
        await tx`update creators set birth_date='1898-05-03' where id=37`;
        const processing = execute(run);
        worker = processing;
        void processing.catch(() => undefined);

        // Release the editor only after PostgreSQL confirms the worker reached the locked row.
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const [row] = await tx`
            select exists (
              select 1 from pg_locks waiter
              join pg_locks holder on holder.transactionid = waiter.transactionid
              where not waiter.granted and waiter.locktype = 'transactionid'
                and holder.granted and holder.pid = pg_backend_pid()
            ) as waiting
          `;
          if (row.waiting) return;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.fail("Worker did not reach the creator row lock");
      });
    } finally {
      await worker;
    }
    assert.equal((await worker)?.filled, 1);
    assert.equal((await dates(37)).birth_date, "1898-05-03");
    assert.equal((await dates(37)).death_date, "1990-07-15");
  });

  await t.test("a provider selection uses only matching bindings and snapshots", async () => {
    await client.unsafe(`
      insert into creators(id,type_id,name,slug) values(39,1,'Selected provider','selected-provider'),(40,1,'Other provider','other-provider');
      insert into provider_creator_bindings(creator_id,provider,external_creator_id)
        values(39,'comic-vine','person:139'),(39,'anilist','person:239'),(39,'fantlab','999'),(40,'anilist','person:240');
    `);
    await comic(139, { birth: "1940-02-04" });
    for (const externalId of ["239", "240"]) {
      await save({ provider: "anilist", resourceType: "person", externalId }, {
        id: Number(externalId), name: { full: "Example" },
        dateOfBirth: { year: 1941, month: 3, day: 5 }, dateOfDeath: null,
      });
    }
    const before = networkCalls;
    const run = await claim((await enqueue({ ...batchInput, creatorIds: [39, 40], providers: ["comic-vine"], fetchMissing: true })).id);
    const progress = await execute(run);
    assert.equal(progress.processed, 1);
    assert.equal(progress.review, 0);
    assert.equal(networkCalls, before);
    assert.equal((await dates(39)).birth_date, "1940-02-04");
    assert.equal((await dates(40)).birth_date, null);
  });

  await t.test("confirmation of a FantLab binding enqueues one automatic fill", async () => {
    const { assignFantlabCreatorBinding } = await import("../src/db/queries/creator-avatars");
    await client`insert into creators(id,type_id,name,slug) values(38,1,'Dan Simmons','dan-simmons')`;
    const profile = JSON.parse(await readFile("tests/fixtures/fantlab-authors/1.json", "utf8"));
    await save({ provider: "fantlab", resourceType: "author", externalId: "1" }, profile);

    const binding = await assignFantlabCreatorBinding({ creatorId: 38, externalCreatorId: "1" });
    const repeated = await assignFantlabCreatorBinding({ creatorId: 38, externalCreatorId: "1" });
    assert.equal(repeated.id, binding.id);
    const queued = await client`
      select id from job_runs where type=${handler.type} and status='queued'
    `;
    assert.equal(queued.length, 1);
    const run = await claim(queued[0].id);
    assert.equal(run.source, "event");
    assert.deepEqual(handler.parsePayload(run.payload), { ...batchInput, creatorIds: [38], fetchMissing: true });
    const progress = await execute(run);
    assert.equal(progress.filled, 2);
    assert.equal((await dates(38)).birth_date, "1948-04-04");
    assert.equal((await dates(38)).death_date, "2026-02-21");
  });
  assert.equal(networkCalls, 0);
});
