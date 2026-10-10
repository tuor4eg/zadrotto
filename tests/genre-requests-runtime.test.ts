import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const testUrl = process.env.GENRES_TEST_DATABASE_URL;

test("genre requests deduplicate, resolve atomically and apply latest metadata without losing manual genres", { skip: !testUrl }, async () => {
  const schema = `genre_requests_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { getDbClient } = await import("../src/db");
  const { upsertMediaItemMetadata, getMediaItemMetadata, deleteMediaItemMetadata } = await import("../src/db/queries/media-item-metadata");
  const { getGenreRequests, getGenreRequestDetail, getPendingGenreRequestCount, resolveGenreRequest, retryGenreRequest, applyGenreRequest, reopenGenreMapping } = await import("../src/db/queries/genre-requests");
  const { getGenreExclusionsPage, restoreGenreExclusion } = await import("../src/db/queries/genre-exclusions");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
      await tx.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY, name text);
        INSERT INTO media_types VALUES ('film','Фильм'),('series','Сериал'),('anime','Аниме'),('game','Игра');
        CREATE TABLE admin_users(id integer PRIMARY KEY); INSERT INTO admin_users VALUES(1);
        CREATE TABLE media_items(id integer PRIMARY KEY, code text, title text, media_type text, metadata_issue_code text);
        INSERT INTO media_items VALUES (1,'one','Один','film',NULL),(2,'two','Два','film',NULL),(3,'three','Три','game',NULL),(4,'four','Legacy','film',NULL),(5,'five','Mixed','film',NULL),(6,'six','Ambiguous','film',NULL),(7,'seven','ID alias','film',NULL);
        CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY REFERENCES media_items(id), facts jsonb NOT NULL DEFAULT '{}',
          source_provider text, source_external_id text, source_url text, fetched_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE media_item_provider_snapshots(media_item_id integer PRIMARY KEY, media_type text, provider_code text, facts jsonb);
        CREATE TABLE admin_activity_logs(id serial PRIMARY KEY, created_at timestamptz DEFAULT now(), actor_type text, admin_user_id integer,
          author_id integer, action text, entity_type text, entity_id integer, entity_label text, status text, severity text, message text,
          ip_address text, user_agent text, metadata jsonb);
        CREATE TABLE job_runs(id serial PRIMARY KEY, job_id integer, retry_of_run_id integer, created_by_admin_id integer,
          type text, payload jsonb DEFAULT '{}', source text, status text DEFAULT 'queued', scheduled_for timestamptz, available_at timestamptz,
          attempts integer DEFAULT 0, max_attempts integer, timeout_seconds integer, retry_base_seconds integer, retry_max_seconds integer,
          locked_at timestamptz, locked_by text, lock_token text, lock_expires_at timestamptz, started_at timestamptz, finished_at timestamptz,
          cancelled_at timestamptz, error_code text, error_message text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
        INSERT INTO media_item_metadata(media_item_id,source_provider,facts) VALUES (1,'tmdb','{"genres":["Новый жанр","TV Movie"]}'), (4,NULL,'{"genres":["комедия","Неизвестный legacy"]}'),
          (5,'tmdb','{"genres":["Unknown mixed",42]}'),
          (6,'tmdb','{"genres":["Ambiguous"],"genreReferences":[{"id":"1","name":"Ambiguous"},{"id":"2","name":"Ambiguous"}]}'),
          (7,'tmdb','{"genres":["Unknownalias"],"genreReferences":[{"id":" 999 ","name":"Unknownalias"}]}');
        INSERT INTO media_item_provider_snapshots VALUES (4,'film','tmdb','{"genres":["комедия","Неизвестный legacy"]}');`);
      const rawBeforeMigration = await tx`SELECT * FROM media_item_metadata ORDER BY media_item_id`;
      for (const file of ["0103_unified_genres.sql", "0104_genre_requests.sql", "0107_genre_mapping_reopen.sql"]) {
        for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) await tx.unsafe(statement);
        if (file === "0103_unified_genres.sql") {
          await tx`INSERT INTO provider_genre_mappings(provider,media_type,external_genre_id,external_genre_name,normalized_external_genre_name,genre_id)
            SELECT 'tmdb','film','999','By id','by id',id FROM genres WHERE slug='comedy'`;
        }
      }
      assert.deepEqual(await tx`SELECT * FROM media_item_metadata ORDER BY media_item_id`, rawBeforeMigration);
      const dml = readFileSync("drizzle/0104_genre_requests.sql", "utf8").split("--> statement-breakpoint");
      const begin = dml.findIndex((statement) => statement.trimStart().startsWith("INSERT INTO provider_genre_exclusions"));
      const end = dml.findIndex((statement) => statement.includes("CREATE FUNCTION preserve_genre_request_job_result"));
      await tx`DROP TABLE pending_genre_sources, pending_genre_backfill`;
      for (const statement of dml.slice(begin, end)) await tx.unsafe(statement);
      assert.equal((await tx`SELECT count(*)::int AS n FROM genre_requests`)[0].n, 1);
      assert.equal((await tx`SELECT count(*)::int AS n FROM genre_request_media_items`)[0].n, 1);
    });
    assert.equal(await getPendingGenreRequestCount(), 1);
    let request = (await getGenreRequests())[0];
    assert.equal(request.externalGenreName, "Новый жанр");
    await Promise.all([1, 2].map((mediaItemId) => upsertMediaItemMetadata({ mediaItemId, sourceProvider: "tmdb",
      facts: { genres: ["  НОВЫЙ   ЖАНР  ", "TV Movie"], genreReferences: [{ id: "900", name: "  НОВЫЙ   ЖАНР  " }] } })));
    assert.equal(await getPendingGenreRequestCount(), 1);
    const detail = (await getGenreRequestDetail(request.id))!;
    assert.equal(detail.request.occurrenceCount, 2);
    assert.deepEqual(detail.variants, [{ name: "НОВЫЙ   ЖАНР", externalId: "900", count: 2 }]);
    assert.equal((await client`SELECT count(*)::int AS n FROM admin_activity_logs WHERE action='genre-request.detected'`)[0].n, 0);
    const decision = await resolveGenreRequest({ requestId: request.id, adminId: 1, decision: "create", name: "  Новый внутренний  " });
    assert.equal((await getGenreRequestDetail(request.id))?.request.status, "applying");
    assert.equal((await client`SELECT count(*)::int AS n FROM provider_genre_mappings WHERE external_genre_id='900'`)[0].n, 0);
    await assert.rejects(resolveGenreRequest({ requestId: request.id, adminId: 1, decision: "exclude" }), /уже принято/);
    await assert.rejects(retryGenreRequest({ requestId: request.id, adminId: 1 }), /Повтор доступен/);
    // One occurrence disappears after the admin decision, before the worker reads current metadata.
    await upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", facts: { genres: ["комедия"] } });
    await client`INSERT INTO media_item_genres(media_item_id, genre_id, is_manual)
      SELECT 1,id,true FROM genres WHERE slug='drama'`;
    const rawBefore = (await getMediaItemMetadata(1))!.facts;
    await client`UPDATE job_runs SET status='running' WHERE id=${decision.jobRunId}`;
    assert.deepEqual(await applyGenreRequest(request.id, { jobRunId: decision.jobRunId }), { processed: 1 });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${decision.jobRunId}`;
    const customId = (await client`SELECT id FROM genres WHERE name='Новый внутренний'`)[0].id;
    assert.deepEqual((await getMediaItemMetadata(1))?.genres.map((g) => g.slug), [`custom-${customId}`, "drama"]);
    assert.deepEqual((await getMediaItemMetadata(1))?.facts, rawBefore);
    assert.deepEqual((await getMediaItemMetadata(2))?.genres.map((g) => g.slug), ["comedy"]);
    assert.equal((await getGenreRequestDetail(request.id))?.request.status, "processed");
    // Missing-provider legacy metadata must not be guessed into the new review queue or cleared by a worker.
    assert.equal((await client`SELECT count(*)::int AS n FROM genre_requests WHERE normalized_external_genre_name='неизвестный legacy'`)[0].n, 0);
    const legacyBefore = await getMediaItemMetadata(4);
    await client`INSERT INTO genre_request_media_items(request_id,media_item_id,external_genre_name) VALUES (${request.id},4,'Новый жанр')`;
    await applyGenreRequest(request.id, { jobRunId: decision.jobRunId });
    assert.deepEqual(await getMediaItemMetadata(4), legacyBefore);
    await client`DELETE FROM job_runs WHERE id=${decision.jobRunId}`;
    assert.equal((await getGenreRequestDetail(request.id))?.request.status, "processed");
    await assert.rejects(retryGenreRequest({ requestId: request.id, adminId: 1 }), /Повтор доступен/);

    // A queue-insert failure rolls the decision, new genre and admin audit record back together.
    await upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", facts: { genres: ["Rollback genre"] } });
    const rollbackRequest = (await getGenreRequests())[0];
    await client.unsafe(`CREATE FUNCTION reject_request_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'enqueue failed'; END $$;
      CREATE TRIGGER reject_request_job BEFORE INSERT ON job_runs FOR EACH ROW EXECUTE FUNCTION reject_request_job();`);
    await assert.rejects(resolveGenreRequest({ requestId: rollbackRequest.id, adminId: 1, decision: "create", name: "Rollback internal" }));
    assert.equal((await getGenreRequestDetail(rollbackRequest.id))?.request.status, "pending");
    assert.equal((await client`SELECT count(*)::int AS n FROM genres WHERE name='Rollback internal'`)[0].n, 0);
    await client.unsafe("DROP TRIGGER reject_request_job ON job_runs");
    const rolledBackThenExcluded = await resolveGenreRequest({ requestId: rollbackRequest.id, adminId: 1, decision: "exclude" });
    await applyGenreRequest(rollbackRequest.id, { jobRunId: rolledBackThenExcluded.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${rolledBackThenExcluded.jobRunId}`;

    await upsertMediaItemMetadata({ mediaItemId: 3, sourceProvider: "rawg", facts: { genres: ["New mechanic"] } });
    request = (await getGenreRequests())[0];
    const filmGenreId = (await client`SELECT id FROM genres WHERE slug='drama'`)[0].id;
    await client`UPDATE genres SET is_active=false WHERE id=${filmGenreId}`;
    await assert.rejects(resolveGenreRequest({ requestId: request.id, adminId: 1, decision: "map", genreIds: [filmGenreId] }), /активные жанры/);
    await client`UPDATE genres SET is_active=true WHERE id=${filmGenreId}`;
    assert.equal((await getGenreRequestDetail(request.id))?.request.status, "pending");
    await assert.rejects(resolveGenreRequest({ requestId: request.id, adminId: 1, decision: "map", genreIds: [2_147_483_648] }), /Выберите хотя бы/);
    const excluded = await resolveGenreRequest({ requestId: request.id, adminId: 1, decision: "exclude" });
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(applyGenreRequest(request.id, { signal: aborted.signal, jobRunId: excluded.jobRunId }));
    await client`UPDATE job_runs SET status='failed', error_message='Test failure' WHERE id=${excluded.jobRunId}`;
    await client`DELETE FROM job_runs WHERE id=${excluded.jobRunId}`;
    assert.equal((await getGenreRequestDetail(request.id))?.request.status, "failed");
    const retried = await retryGenreRequest({ requestId: request.id, adminId: 1 });
    await applyGenreRequest(request.id, { jobRunId: retried.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${retried.jobRunId}`;
    await upsertMediaItemMetadata({ mediaItemId: 3, sourceProvider: "rawg", facts: { genres: ["New mechanic"] } });
    assert.equal(await getPendingGenreRequestCount(), 0);
    assert.deepEqual((await getMediaItemMetadata(3))?.genres, []);
    // Decision/import races serialize by the request lock; competing admins enqueue one job only.
    await upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", facts: { genres: ["Race genre"] } });
    const raceRequest = (await getGenreRequests())[0];
    const [raceDecisions] = await Promise.all([
      Promise.allSettled([
        resolveGenreRequest({ requestId: raceRequest.id, adminId: 1, decision: "map", genreIds: [filmGenreId] }),
        resolveGenreRequest({ requestId: raceRequest.id, adminId: 1, decision: "map", genreIds: [filmGenreId] }),
      ]),
      upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", facts: { genres: ["Race genre"] } }),
    ]);
    assert.equal(raceDecisions.filter((result) => result.status === "fulfilled").length, 1);
    const raceJob = raceDecisions.find((result) => result.status === "fulfilled")!;
    if (raceJob.status !== "fulfilled") throw new Error("Missing successful decision");
    await applyGenreRequest(raceRequest.id, { jobRunId: raceJob.value.jobRunId });
    assert.deepEqual((await getMediaItemMetadata(2))?.genres.map((genre) => genre.slug), ["drama"]);
    assert.equal((await client`SELECT count(*)::int AS n FROM job_runs WHERE payload->>'requestId'=${String(raceRequest.id)}`)[0].n, 1);
    // Multiple worker batches and detail pagination use stable media IDs, without provider calls.
    await client.unsafe(`INSERT INTO media_items(id,code,title,media_type)
      SELECT id,'batch-'||id,'Batch '||id,'film' FROM generate_series(10,114) id;
      INSERT INTO media_item_metadata(media_item_id,source_provider,facts)
      SELECT id,'tmdb','{"genres":["Race genre"]}'::jsonb FROM generate_series(10,114) id;`);
    await client`INSERT INTO genre_request_media_items(request_id,media_item_id,external_genre_name)
      SELECT ${raceRequest.id},id,'Race genre' FROM generate_series(10,114) id`;
    assert.deepEqual(await applyGenreRequest(raceRequest.id, { jobRunId: raceJob.value.jobRunId }), { processed: 106 });
    const batchDetail = (await getGenreRequestDetail(raceRequest.id, { page: 2 }))!;
    assert.equal(batchDetail.totalPages, 6);
    assert.equal(batchDetail.items.length, 20);
    assert.equal((await client`SELECT count(*)::int AS n FROM media_item_genres WHERE media_item_id>=10 AND genre_id=${filmGenreId}`)[0].n, 105);
    const originalUnsafe = client.unsafe;
    let queryCount = 0;
    client.unsafe = ((...args: Parameters<typeof originalUnsafe>) => {
      queryCount++;
      return originalUnsafe.apply(client, args);
    }) as typeof originalUnsafe;
    try {
      await getGenreRequests({ all: true });
      assert.equal(queryCount, 1);
      queryCount = 0;
      await getGenreRequestDetail(raceRequest.id, { page: 2 });
      assert.equal(queryCount, 4);
    } finally {
      client.unsafe = originalUnsafe;
    }
    await deleteMediaItemMetadata(3);
    assert.equal((await getGenreRequestDetail(request.id))?.request.occurrenceCount, 0);
    assert.equal((await client`SELECT count(*)::int AS n FROM admin_activity_logs WHERE action='genre-request.detected'`)[0].n, 3);
    await client`INSERT INTO provider_genre_exclusions(provider,media_type,external_genre_name,normalized_external_genre_name)
      SELECT 'restore-test','film','Отменённый ' || n,'отмененный ' || n FROM generate_series(1,28) n`;
    const cancelled = await getGenreExclusionsPage({ searchQuery: "  ОТМЕНЁННЫЙ  ", page: 1 });
    assert.equal(cancelled.total, 28);
    assert.equal(cancelled.items.length, 25);
    const cancelledNext = await getGenreExclusionsPage({ searchQuery: "Отменённый", page: 2 });
    assert.equal(cancelledNext.items.length, 3);
    const restoredId = await restoreGenreExclusion(cancelled.items[0].id, 1);
    assert.equal((await getGenreRequestDetail(restoredId))?.request.status, "pending");
    await assert.rejects(restoreGenreExclusion(cancelled.items[0].id, 1), /not-found/);
    const pendingJob = await resolveGenreRequest({ requestId: restoredId, adminId: 1, decision: "exclude" });
    const [blocked] = await client`SELECT id FROM provider_genre_exclusions WHERE provider='restore-test'
      AND normalized_external_genre_name=(SELECT normalized_external_genre_name FROM genre_requests WHERE id=${restoredId})`;
    await assert.rejects(restoreGenreExclusion(Number(blocked.id), 1), /applying/);
    assert.equal((await getGenreRequestDetail(restoredId))?.request.decision, "exclude");
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${pendingJob.jobRunId}`;
    assert.equal(await restoreGenreExclusion(Number(blocked.id), 1), restoredId);
    assert.equal((await getGenreRequestDetail(restoredId))?.request.status, "pending");
    const [gameGenre] = await client`SELECT id FROM genres WHERE slug LIKE 'game-%' AND is_active=true LIMIT 1`;
    await resolveGenreRequest({ requestId: restoredId, adminId: 1, decision: "map", genreIds: [Number(gameGenre.id)] });
    assert.equal((await getGenreRequestDetail(restoredId))?.genres[0].id, Number(gameGenre.id));

    // Returning a create decision preserves the created genre and raw metadata, but removes its automatic assignment.
    const [createdMapping] = await client`SELECT id FROM provider_genre_mappings WHERE genre_id=${customId}
      AND normalized_external_genre_name='новый жанр'`;
    const createdRequestId = (await client`SELECT id FROM genre_requests WHERE normalized_external_genre_name='новый жанр'`)[0].id;
    const reopenedCreated = await reopenGenreMapping({ mappingId: Number(createdMapping.id), adminId: 1 });
    assert.equal(reopenedCreated.requestId, Number(createdRequestId));
    assert.equal((await getGenreRequestDetail(reopenedCreated.requestId))?.request.status, "applying");
    assert.equal((await getGenreRequestDetail(reopenedCreated.requestId))?.request.decision, null);
    await assert.rejects(reopenGenreMapping({ mappingId: Number(createdMapping.id), adminId: 1 }));
    await assert.rejects(resolveGenreRequest({ requestId: reopenedCreated.requestId, adminId: 1, decision: "exclude" }));
    await applyGenreRequest(reopenedCreated.requestId, { jobRunId: reopenedCreated.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${reopenedCreated.jobRunId}`;
    assert.equal((await getGenreRequestDetail(reopenedCreated.requestId))?.request.status, "pending");
    assert.deepEqual((await getMediaItemMetadata(1))?.genres.map((genre) => genre.slug), ["drama"]);
    assert.deepEqual((await getMediaItemMetadata(1))?.facts, rawBefore);
    assert.equal((await client`SELECT count(*)::int AS n FROM genres WHERE id=${customId}`)[0].n, 1);
    await client`DELETE FROM job_runs WHERE id=${reopenedCreated.jobRunId}`;
    assert.equal((await getGenreRequestDetail(reopenedCreated.requestId))?.request.status, "pending");
    await assert.rejects(retryGenreRequest({ requestId: reopenedCreated.requestId, adminId: 1 }));

    // One provider variant can map to several internal genres; all its mappings return together.
    await client`INSERT INTO media_items(id,code,title,media_type) VALUES (200,'reopen','Возврат','film')`;
    await upsertMediaItemMetadata({ mediaItemId: 200, sourceProvider: "tmdb", facts: { genres: ["Reopen shared"] } });
    const sharedRequestId = (await client`SELECT id FROM genre_requests WHERE normalized_external_genre_name='reopen shared'`)[0].id;
    const sharedDecision = await resolveGenreRequest({ requestId: Number(sharedRequestId), adminId: 1, decision: "map", genreIds: [customId, filmGenreId] });
    const sharedMappings = await client`SELECT id FROM provider_genre_mappings WHERE normalized_external_genre_name='reopen shared' ORDER BY id`;
    await assert.rejects(reopenGenreMapping({ mappingId: Number(sharedMappings[0].id), adminId: 1 }));
    assert.equal((await client`SELECT count(*)::int AS n FROM provider_genre_mappings WHERE normalized_external_genre_name='reopen shared'`)[0].n, 2);
    await applyGenreRequest(Number(sharedRequestId), { jobRunId: sharedDecision.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${sharedDecision.jobRunId}`;
    await client`INSERT INTO provider_genre_mappings(provider,media_type,external_genre_name,normalized_external_genre_name,genre_id)
      VALUES ('tmdb','film','Still confirmed','still confirmed',${customId})`;
    await upsertMediaItemMetadata({ mediaItemId: 200, sourceProvider: "tmdb", facts: { genres: ["Reopen shared", "Still confirmed"] } });
    await client`INSERT INTO media_item_genres(media_item_id,genre_id,is_manual) SELECT 200,id,true FROM genres WHERE slug='comedy'`;
    const sharedFacts = (await getMediaItemMetadata(200))!.facts;
    const competingReturns = await Promise.allSettled(sharedMappings.map((mapping) => reopenGenreMapping({ mappingId: Number(mapping.id), adminId: 1 })));
    assert.equal(competingReturns.filter((result) => result.status === "fulfilled").length, 1);
    const successfulReturn = competingReturns.find((result) => result.status === "fulfilled")!;
    if (successfulReturn.status !== "fulfilled") throw new Error("Missing successful return");
    const reopenedShared = successfulReturn.value;
    assert.equal((await client`SELECT count(*)::int AS n FROM provider_genre_mappings WHERE normalized_external_genre_name='reopen shared'`)[0].n, 0);
    assert.equal((await client`SELECT count(*)::int AS n FROM job_runs WHERE payload->>'requestId'=${String(sharedRequestId)}`)[0].n, 2);
    const stoppedReturn = new AbortController(); stoppedReturn.abort();
    await assert.rejects(applyGenreRequest(Number(sharedRequestId), { signal: stoppedReturn.signal, jobRunId: reopenedShared.jobRunId }));
    await client`UPDATE job_runs SET status='failed',error_message='Return failed' WHERE id=${reopenedShared.jobRunId}`;
    await client`DELETE FROM job_runs WHERE id=${reopenedShared.jobRunId}`;
    assert.equal((await getGenreRequestDetail(Number(sharedRequestId)))?.request.status, "failed");
    assert.equal((await getGenreRequestDetail(Number(sharedRequestId)))?.request.decision, null);
    await assert.rejects(resolveGenreRequest({ requestId: Number(sharedRequestId), adminId: 1, decision: "exclude" }));
    const failedReturnRetry = await retryGenreRequest({ requestId: Number(sharedRequestId), adminId: 1 });
    await client`UPDATE job_runs SET status='cancelled' WHERE id=${failedReturnRetry.jobRunId}`;
    await client`DELETE FROM job_runs WHERE id=${failedReturnRetry.jobRunId}`;
    assert.equal((await getGenreRequestDetail(Number(sharedRequestId)))?.request.status, "failed");
    const returnRetry = await retryGenreRequest({ requestId: Number(sharedRequestId), adminId: 1 });
    await applyGenreRequest(Number(sharedRequestId), { jobRunId: returnRetry.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${returnRetry.jobRunId}`;
    assert.deepEqual((await getMediaItemMetadata(200))?.genres.map((genre) => genre.slug), ["comedy", `custom-${customId}`]);
    assert.deepEqual((await getMediaItemMetadata(200))?.facts, sharedFacts);
    assert.equal((await getGenreRequestDetail(Number(sharedRequestId)))?.request.status, "pending");
    const corrected = await resolveGenreRequest({ requestId: Number(sharedRequestId), adminId: 1, decision: "map", genreIds: [filmGenreId] });
    await applyGenreRequest(Number(sharedRequestId), { jobRunId: corrected.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${corrected.jobRunId}`;
    assert.deepEqual((await getMediaItemMetadata(200))?.genres.map((genre) => genre.slug), ["comedy", `custom-${customId}`, "drama"]);

    // Old seeded mappings have no request. Discover current occurrences by normalized name and external ID.
    await client`INSERT INTO media_items(id,code,title,media_type) VALUES
      (201,'seed-name','Имя','film'),(202,'seed-id','ID','film'),(203,'seed-provider','Другой провайдер','film'),(204,'seed-type','Другой тип','game')`;
    const [seedMapping] = await client`INSERT INTO provider_genre_mappings(provider,media_type,external_genre_id,external_genre_name,normalized_external_genre_name,genre_id)
      VALUES ('tmdb','film','2009','Seed return','seed return',${filmGenreId}) RETURNING id`;
    await upsertMediaItemMetadata({ mediaItemId: 201, sourceProvider: "tmdb", facts: { genres: ["  SEED   RETURN  "] } });
    await upsertMediaItemMetadata({ mediaItemId: 202, sourceProvider: "tmdb", facts: { genres: ["Seed alias"], genreReferences: [{ id: "2009", name: "Seed alias" }] } });
    await upsertMediaItemMetadata({ mediaItemId: 203, sourceProvider: "rawg", facts: { genres: ["Seed return"] } });
    await upsertMediaItemMetadata({ mediaItemId: 204, sourceProvider: "tmdb", facts: { genres: ["Seed return"] } });
    assert.equal((await client`SELECT count(*)::int AS n FROM genre_requests WHERE provider='tmdb' AND media_type='film' AND normalized_external_genre_name='seed return'`)[0].n, 0);
    // Enqueue failure must restore the seed mapping and avoid leaving a partial request or audit record.
    const auditCount = (await client`SELECT count(*)::int AS n FROM admin_activity_logs`)[0].n;
    await client.unsafe("CREATE TRIGGER reject_request_job BEFORE INSERT ON job_runs FOR EACH ROW EXECUTE FUNCTION reject_request_job()");
    await assert.rejects(reopenGenreMapping({ mappingId: Number(seedMapping.id), adminId: 1 }));
    await client.unsafe("DROP TRIGGER reject_request_job ON job_runs");
    assert.equal((await client`SELECT count(*)::int AS n FROM provider_genre_mappings WHERE id=${seedMapping.id}`)[0].n, 1);
    assert.equal((await client`SELECT count(*)::int AS n FROM genre_requests WHERE provider='tmdb' AND media_type='film' AND normalized_external_genre_name='seed return'`)[0].n, 0);
    assert.equal((await client`SELECT count(*)::int AS n FROM admin_activity_logs`)[0].n, auditCount);
    const reopenedSeed = await reopenGenreMapping({ mappingId: Number(seedMapping.id), adminId: 1 });
    assert.deepEqual((await getGenreRequestDetail(reopenedSeed.requestId))?.items, []);
    assert.deepEqual((await client`SELECT payload FROM job_runs WHERE id=${reopenedSeed.jobRunId}`)[0].payload,
      { requestId: reopenedSeed.requestId });
    // ID aliases must still be recalculated when the original job history no longer exists.
    await assert.rejects(applyGenreRequest(reopenedSeed.requestId, { jobRunId: reopenedSeed.jobRunId, signal: stoppedReturn.signal }));
    await client`UPDATE job_runs SET status='failed' WHERE id=${reopenedSeed.jobRunId}`;
    await client`DELETE FROM job_runs WHERE id=${reopenedSeed.jobRunId}`;
    const seedRetry = await retryGenreRequest({ requestId: reopenedSeed.requestId, adminId: 1 });
    await applyGenreRequest(reopenedSeed.requestId, { jobRunId: seedRetry.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${seedRetry.jobRunId}`;
    assert.deepEqual((await getMediaItemMetadata(201))?.genres, []);
    assert.deepEqual((await getMediaItemMetadata(202))?.genres, []);
    assert.equal((await getGenreRequestDetail(reopenedSeed.requestId))?.request.status, "pending");
    assert.deepEqual((await getGenreRequestDetail(reopenedSeed.requestId))?.items.map((item) => item.id), [201]);
    assert.equal((await client`SELECT count(*)::int AS n FROM genre_requests WHERE provider='tmdb'
      AND media_type='film' AND normalized_external_genre_name='seed alias'`)[0].n, 1);
    // Returning a seeded mapping while metadata is refreshed must preserve the media→request lock order.
    await client`INSERT INTO media_items(id,code,title,media_type) VALUES (205,'seed-race','Seed race','film')`;
    const [seedRaceMapping] = await client`INSERT INTO provider_genre_mappings(provider,media_type,external_genre_name,normalized_external_genre_name,genre_id)
      VALUES ('tmdb','film','Seed race','seed race',${filmGenreId}) RETURNING id`;
    await upsertMediaItemMetadata({ mediaItemId: 205, sourceProvider: "tmdb", facts: { genres: ["Seed race"] } });
    const [seedRaceReturn] = await Promise.all([
      reopenGenreMapping({ mappingId: Number(seedRaceMapping.id), adminId: 1 }),
      upsertMediaItemMetadata({ mediaItemId: 205, sourceProvider: "tmdb", facts: { genres: ["Seed race"] } }),
    ]);
    await applyGenreRequest(seedRaceReturn.requestId, { jobRunId: seedRaceReturn.jobRunId });
    assert.deepEqual((await getMediaItemMetadata(205))?.genres, []);
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
