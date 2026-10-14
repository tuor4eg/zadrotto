import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { after, before, describe, it } from "node:test"
import postgres from "postgres"

// Run with NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server TITLE_PARTS_DB_TEST=1 tsx --test tests/title-parts-db.test.ts
// Explicit opt-in: this suite owns a disposable PostgreSQL container and never
// reads DATABASE_URL or connects to an existing database.
const enabled = process.env.TITLE_PARTS_DB_TEST === "1"
const container = `zadrotto-title-parts-test-${process.pid}`
let db: ReturnType<typeof postgres>
let started = false
const originalDatabaseUrl = process.env.DATABASE_URL
let appDb: typeof import("../src/db") | undefined
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim()

const fixture = `
CREATE TABLE media_items(id serial PRIMARY KEY, media_type text NOT NULL DEFAULT 'series',
 code text NOT NULL DEFAULT 'test', title text NOT NULL DEFAULT 'Test', release_year integer DEFAULT 2020, publication_status text NOT NULL DEFAULT 'published',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ratings(
 id serial PRIMARY KEY, media_item_id integer NOT NULL REFERENCES media_items(id),
 author_id integer NOT NULL, score integer NOT NULL CHECK(score BETWEEN 10 AND 100 AND score % 10 = 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ratings_media_item_id_author_id_unique UNIQUE(media_item_id,author_id)
);
CREATE TABLE contributions(
 id serial PRIMARY KEY, author_id integer NOT NULL,
 primary_media_item_id integer NOT NULL REFERENCES media_items(id), type text NOT NULL,
 status text NOT NULL DEFAULT 'draft'
);
CREATE UNIQUE INDEX contributions_review_author_media_unique
 ON contributions(author_id,primary_media_item_id) WHERE type='review';
CREATE TABLE media_item_rating_stats(
 media_item_id integer PRIMARY KEY REFERENCES media_items(id),
 ratings_count integer NOT NULL CHECK(ratings_count >= 1),
 score_sum integer NOT NULL CHECK(score_sum BETWEEN ratings_count*10 AND ratings_count*100)
);
CREATE FUNCTION sync_media_item_rating_stats() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER ratings_sync_media_item_rating_stats AFTER INSERT ON ratings
 FOR EACH ROW EXECUTE FUNCTION sync_media_item_rating_stats();
INSERT INTO media_items(id) VALUES (1),(2),(3);
INSERT INTO ratings(media_item_id,author_id,score) VALUES(1,1,80);
`

async function stats(itemId = 1) {
  const rows = await db`SELECT ratings_count,score_sum::float8 AS score_sum FROM media_item_rating_stats WHERE media_item_id=${itemId}`
  return rows[0] ?? null
}

async function rejectCode(promise: PromiseLike<unknown>, code: string) {
  await assert.rejects(Promise.resolve(promise), (error: unknown) =>
    error instanceof postgres.PostgresError && error.code === code)
}

describe("title parts PostgreSQL migration and constraints", { skip: !enabled }, () => {
  before(async () => {
    docker("run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=title-parts-test", "-p", "127.0.0.1::5432", "postgres:17-alpine")
    started = true
    const port = Number(docker("port", container, "5432/tcp").split(":").at(-1))
    db = postgres({ host: "127.0.0.1", port, username: "postgres", password: "title-parts-test", database: "postgres", max: 4, connect_timeout: 2, onnotice() {} })
    for (let attempt = 0; ; attempt += 1) {
      try { await db`SELECT 1`; break } catch (error) {
        if (attempt >= 30) throw error
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    process.env.DATABASE_URL = `postgres://postgres:title-parts-test@127.0.0.1:${port}/postgres`
    appDb = await import("../src/db")
    await db.unsafe(fixture)
    // LOCK TABLE requires the same explicit transaction used by migrations.
    await db.begin(async (tx) => { await tx.unsafe(readFileSync("drizzle/0114_title_parts.sql", "utf8")); await tx.unsafe(readFileSync("drizzle/0115_title_part_descriptions.sql", "utf8")) })
    await db`INSERT INTO title_parts(id,media_item_id,type,number,sort_order) VALUES(1,1,'season',1,1),(2,1,'season',2,2),(3,1,'season',3,3),(4,2,'volume',1,1)`
  })
  after(async () => {
    if (appDb) await appDb.dbClient.end({ timeout: 2 })
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
    if (db) await db.end({ timeout: 2 })
    if (started) docker("stop", container)
  })

  it("migrates the existing overall vote and permits independent scopes", async () => {
    assert.deepEqual(await stats(), { ratings_count: 1, score_sum: 80 })
    await db`INSERT INTO ratings(media_item_id,author_id,part_id,score) VALUES(1,1,1,70),(1,1,2,60)`
    assert.deepEqual(await stats(), { ratings_count: 1, score_sum: 80 })
    await rejectCode(db`INSERT INTO ratings(media_item_id,author_id,score) VALUES(1,1,90)`, "23505")
    await rejectCode(db`INSERT INTO ratings(media_item_id,author_id,part_id,score) VALUES(1,1,1,90)`, "23505")
    await rejectCode(db`INSERT INTO ratings(media_item_id,author_id,part_id,score) VALUES(2,1,1,90)`, "23503")
    await rejectCode(db`DELETE FROM title_parts WHERE id=1`, "23503")
  })

  it("falls back to a fractional average, updates and removes the last vote", async () => {
    await db`DELETE FROM ratings WHERE media_item_id=1 AND part_id IS NULL`
    assert.deepEqual(await stats(), { ratings_count: 1, score_sum: 65 })
    await db`INSERT INTO ratings(media_item_id,author_id,part_id,score) VALUES(1,1,3,70)`
    assert.ok(Math.abs((await stats()).score_sum - 200 / 3) < 1e-10)
    await db`UPDATE ratings SET score=80 WHERE media_item_id=1 AND part_id=2`
    assert.ok(Math.abs((await stats()).score_sum - 220 / 3) < 1e-10)
    await db`INSERT INTO ratings(media_item_id,author_id,score) VALUES(1,1,100)`
    assert.deepEqual(await stats(), { ratings_count: 1, score_sum: 100 })
    await db`DELETE FROM ratings WHERE media_item_id=1 AND part_id IS NULL`
    assert.ok(Math.abs((await stats()).score_sum - 220 / 3) < 1e-10)
    await db`DELETE FROM ratings WHERE media_item_id=1`
    assert.equal(await stats(), null)
  })

  it("supports an overall review and different part reviews at every status", async () => {
    await db`INSERT INTO contributions(author_id,primary_media_item_id,type,part_id,status) VALUES(1,1,'review',NULL,'approved'),(1,1,'review',1,'draft'),(1,1,'review',2,'rejected')`
    await rejectCode(db`INSERT INTO contributions(author_id,primary_media_item_id,type) VALUES(1,1,'review')`, "23505")
    await rejectCode(db`INSERT INTO contributions(author_id,primary_media_item_id,type,part_id) VALUES(1,1,'review',2)`, "23505")
    await rejectCode(db`INSERT INTO contributions(author_id,primary_media_item_id,type,part_id) VALUES(2,2,'review',1)`, "23503")
    await rejectCode(db`INSERT INTO contributions(author_id,primary_media_item_id,type,part_id) VALUES(2,1,'collection',1)`, "23514")
    await rejectCode(db`DELETE FROM title_parts WHERE id=2`, "23503")
  })

  it("serializes concurrent authors and concurrent scopes of one author", async () => {
    await Promise.all(Array.from({ length: 12 }, (_, index) => db.begin(async (tx) => {
      await tx`INSERT INTO ratings(media_item_id,author_id,part_id,score) VALUES(1,${index + 10},1,80)`
      await tx`SELECT pg_sleep(0.01)`
    })))
    assert.deepEqual(await stats(), { ratings_count: 12, score_sum: 960 })
    await Promise.all([
      db`INSERT INTO ratings(media_item_id,author_id,part_id,score) VALUES(1,50,1,70)`,
      db`INSERT INTO ratings(media_item_id,author_id,part_id,score) VALUES(1,50,2,80)`,
      db`INSERT INTO ratings(media_item_id,author_id,part_id,score) VALUES(1,50,3,80)`,
    ])
    assert.equal((await stats()).ratings_count, 13)
    assert.ok(Math.abs((await stats()).score_sum - (960 + 230 / 3)) < 1e-10)
  })

  it("reads parts and current-author ratings through the production query without multiplying rows", async () => {
    const { getTitlePartsForMediaItem } = await import("../src/db/queries/title-parts")
    const parts = await getTitlePartsForMediaItem(1, 50)
    assert.equal(parts.length, 3)
    assert.deepEqual(parts.map((part) => part.myRating), [70, 80, 80])
    assert.equal(parts[0].ratingsCount, 13)
    assert.ok(Math.abs(parts[0].archiveRating! - (12 * 80 + 70) / 13) < 1e-10)
    const guest = await getTitlePartsForMediaItem(1)
    assert.ok(guest.every((part) => part.myRating === null))
  })

  it("qualifies computed rating columns when joining a record with the same column names", async () => {
    const { eq, sql } = await import("drizzle-orm")
    const { mediaItems } = await import("../src/db/schema")
    const { getEffectiveRatingsQuery, effectiveRatingColumns } = await import("../src/db/queries/effective-ratings")
    const effective = getEffectiveRatingsQuery()
    const rows = await appDb!.db.select({
      mediaType: mediaItems.mediaType,
      count: sql<number>`count(${effectiveRatingColumns.id})::int`,
      average: sql<number>`avg(${effectiveRatingColumns.score})::float8`,
      recentCount: sql<number>`count(${effectiveRatingColumns.id}) filter (where ${effectiveRatingColumns.createdAt} <= now())::int`,
    }).from(effective).innerJoin(mediaItems, eq(mediaItems.id, effective.mediaItemId))
      .groupBy(mediaItems.mediaType)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].count, 13)
    assert.equal(rows[0].recentCount, 13)
    assert.ok(Math.abs(rows[0].average - (960 + 230 / 3) / 13) < 1e-10)
    const distribution = await appDb!.db.select({
      score: effectiveRatingColumns.distributionScore,
      count: sql<number>`count(${effectiveRatingColumns.id})::int`,
    }).from(effective).innerJoin(mediaItems, eq(mediaItems.id, effective.mediaItemId))
      .groupBy(effectiveRatingColumns.distributionScore)
    assert.deepEqual(distribution, [{ score: 80, count: 13 }])
    const { getAuthorRatingSummary } = await import("../src/db/queries/ratings")
    const summary = await getAuthorRatingSummary(50, ["series"])
    assert.equal(summary.ratingsCount, 1)
    assert.ok(Math.abs(summary.averageScore! - 230 / 3) < 1e-10)
    assert.deepEqual(summary.distribution, [{ mediaType: "series", ratingsCount: 1 }])
    assert.deepEqual(summary.scoreDistribution, [{ score: 80, ratingsCount: 1 }])
    assert.equal(summary.latestRatings.length, 3)

  })

  it("provider sync retains IDs and user history, reports collisions and preserves missing parts", async () => {
    const { syncProviderTitleParts } = await import("../src/db/queries/title-parts-sync")
    const input = { type: "season" as const, number: 1, name: "Первый", description: "Русское описание сезона", year: 2020, externalId: "s-1", airDate: "2020-01-01", episodeCount: 8, posterSourceUrl: "https://image.tmdb.org/a.jpg", sortOrder: 1 }
    const conflicts = await appDb!.db.transaction((tx) => syncProviderTitleParts(tx, { mediaItemId: 1, provider: "tmdb", parts: [input] }))
    assert.equal(conflicts.conflicts.length, 1)
    await db`UPDATE title_parts SET source_provider='tmdb',external_id='old-1' WHERE id=1`
    const first = await appDb!.db.transaction((tx) => syncProviderTitleParts(tx, { mediaItemId: 1, provider: "tmdb", parts: [input] }))
    assert.equal(first.conflicts.length, 0)
    assert.equal(first.posters[0].partId, 1)
    await appDb!.db.transaction((tx) => syncProviderTitleParts(tx, { mediaItemId: 1, provider: "tmdb", parts: [{ ...input, description: undefined }] }))
    const [descriptionRow] = await db`SELECT description FROM title_parts WHERE id=1`
    assert.equal(descriptionRow.description, "Русское описание сезона")
    await db`UPDATE title_parts SET cover_url='covers/title-parts/one.jpg' WHERE id=1`
    const again = await appDb!.db.transaction((tx) => syncProviderTitleParts(tx, { mediaItemId: 1, provider: "tmdb", parts: [{ ...input, name: "Обновлённый" }] }))
    assert.equal(again.posters.length, 0)
    const rows = await db`SELECT id,name,external_id FROM title_parts WHERE media_item_id=1 ORDER BY id`
    assert.equal(rows.length, 3)
    assert.deepEqual(rows[0], { id: 1, name: "Обновлённый", external_id: "s-1" })
    assert.equal((await stats()).ratings_count, 13)
    const reviews = await db`SELECT count(*)::int AS count FROM contributions WHERE part_id=1`
    assert.equal(reviews[0].count, 1)
  })

  it("moves an overall rating between records and repairs drift without losing fractions", async () => {
    await db`INSERT INTO ratings(media_item_id,author_id,score) VALUES(2,60,90)`
    await db`UPDATE ratings SET media_item_id=3 WHERE author_id=60`
    assert.equal(await stats(2), null)
    assert.deepEqual(await stats(3), { ratings_count: 1, score_sum: 90 })
    await db`UPDATE media_item_rating_stats SET score_sum=ratings_count*10 WHERE media_item_id=1`
    await db.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(73001,1)`
      await tx`SELECT refresh_media_item_rating_stats(1)`
    })
    assert.ok(Math.abs((await stats()).score_sum - (960 + 230 / 3)) < 1e-10)
    const { auditMediaItemRatingStats, reconcileMediaItemRatingStatsBatch } = await import("../src/db/queries/media-item-rating-stats")
    assert.equal((await auditMediaItemRatingStats()).mismatchCount, 0)
    await db`UPDATE media_item_rating_stats SET score_sum=ratings_count*10 WHERE media_item_id=1`
    const audit = await auditMediaItemRatingStats()
    assert.equal(audit.mismatchCount, 1)
    assert.ok(Math.abs(audit.items[0].actualScoreSum - (960 + 230 / 3)) < 1e-10)
    const repaired = await reconcileMediaItemRatingStatsBatch({ batchSize: 500 })
    assert.equal(repaired.corrected, 1)
    assert.equal((await auditMediaItemRatingStats()).mismatchCount, 0)
  })
  it("review scores prefer their part, fall back only to the overall rating and otherwise stay absent", async () => {
    const { and, eq, sql } = await import("drizzle-orm")
    const { contributions, ratings } = await import("../src/db/schema")
    const { reviewAuthorScoreSql } = await import("../src/db/queries/review-author-score")
    const read = () => appDb!.db.select({ partId: contributions.partId, score: reviewAuthorScoreSql() })
      .from(contributions).leftJoin(ratings, and(eq(ratings.authorId, contributions.authorId),
        eq(ratings.mediaItemId, contributions.primaryMediaItemId),
        sql`${ratings.partId} is not distinct from ${contributions.partId}`))
      .where(eq(contributions.authorId, 1)).orderBy(sql`${contributions.partId} nulls first`)
    await db`INSERT INTO ratings(media_item_id,author_id,score) VALUES(1,1,90)`
    await db`INSERT INTO ratings(media_item_id,author_id,part_id,score) VALUES(1,1,1,80)`
    assert.deepEqual(await read(), [{ partId: null, score: 90 }, { partId: 1, score: 80 }, { partId: 2, score: 90 }])
    await db`DELETE FROM ratings WHERE author_id=1 AND part_id=1`
    assert.ok((await read()).every((review) => review.score === 90))
    await db`DELETE FROM ratings WHERE author_id=1`
    assert.ok((await read()).every((review) => review.score === null))
  })

  it("forced metadata backfill refreshes populated records with a type filter and preserves ordinary selection", async () => {
    await db.unsafe(`ALTER TABLE media_items ADD COLUMN original_title text, ADD COLUMN metadata_attempted_at timestamptz, ADD COLUMN media_carrier_id integer;
      CREATE TABLE media_carriers(id integer PRIMARY KEY, code text);
      CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY, source_provider text, source_external_id text, facts jsonb, fetched_at timestamptz);
      UPDATE media_items SET media_type='film' WHERE id=2;
      INSERT INTO media_items(id,publication_status) VALUES(4,'private');
      INSERT INTO media_item_metadata VALUES(1,'tmdb','1','{"seasonCount":3}',now()),(2,'tmdb','2','{"runtimeMinutes":100}',now()),(3,'tmdb','3','{}',null),(4,'tmdb','4','{"seasonCount":1}',now());`)
    const { getMediaItemsMissingMetadata } = await import("../src/db/queries/media-item-metadata")
    assert.deepEqual((await getMediaItemsMissingMetadata({ mediaType: "series" })).map((item) => item.id), [3])
    assert.deepEqual((await getMediaItemsMissingMetadata({ force: true, mediaType: "series" })).map((item) => item.id), [3, 1])
    assert.deepEqual((await getMediaItemsMissingMetadata({ force: true, mediaType: "film" })).map((item) => item.id), [2])
    assert.equal((await getMediaItemsMissingMetadata({ force: true, mediaType: "series", limit: 1 })).length, 1)
    assert.deepEqual(await getMediaItemsMissingMetadata({ force: true, mediaItemId: 4 }), [])
    // partsOnly skips series that already have TMDB seasons, so batch reruns do not re-pick them
    assert.deepEqual((await getMediaItemsMissingMetadata({ partsOnly: true })).map((item) => item.id), [3])
    assert.deepEqual((await getMediaItemsMissingMetadata({ partsOnly: true, force: true })).map((item) => item.id), [3, 1])
    const { jobHandlerRegistry } = await import("../src/lib/jobs/handlers")
    const parse = jobHandlerRegistry.get("media.metadata-backfill").parsePayload
    assert.deepEqual(parse({ force: true, mediaType: "series", limit: 200 }), {
      force: true, mediaType: "series", limit: 200, mediaItemId: undefined, quotaReserve: undefined, partsOnly: undefined,
    })
    assert.deepEqual(parse({ partsOnly: true, limit: 25 }), {
      force: undefined, mediaType: undefined, limit: 25, mediaItemId: undefined, quotaReserve: undefined, partsOnly: true,
    })
    for (const payload of [{ force: "true" }, { mediaType: 1 }, { mediaType: "bad type" }, { limit: 201 }, { unexpected: true }]) {
      assert.throws(() => parse(payload))
    }
  })


  it("ignores historical specials votes and rejects new ones", async () => {
    await db.unsafe("INSERT INTO title_parts (id,media_item_id,type,number,sort_order) VALUES (999,1,'season',0,999)");
    const [special] = await db.unsafe("SELECT id FROM title_parts WHERE media_item_id=1 AND type='season' AND number=0");
    await db.unsafe(`INSERT INTO ratings (media_item_id,author_id,part_id,score) VALUES (1,999,${special.id},100)`);
    await db.begin(async (tx) => { await tx.unsafe(readFileSync("drizzle/0116_unrated_specials.sql", "utf8")); });
    const [count] = await db.unsafe("SELECT count(*)::int AS n FROM ratings WHERE author_id=999");
    assert.equal(count.n, 1);
    const { getAuthorRatingSummary } = await import("../src/db/queries/ratings");
    const summary = await getAuthorRatingSummary(999, ["series"]);
    assert.equal(summary.ratingsCount, 0);
    await assert.rejects(db.unsafe(`INSERT INTO ratings (media_item_id,author_id,part_id,score) VALUES (1,998,${special.id},80)`), /Specials cannot be rated/);
    const { auditMediaItemRatingStats } = await import("../src/db/queries/media-item-rating-stats");
    assert.equal((await auditMediaItemRatingStats()).mismatchCount, 0);
  });

  it("retargets a review without changing status or identity and serializes conflicts", async () => {
    await db.unsafe(`ALTER TABLE contributions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
      CREATE TABLE contribution_reviews(contribution_id integer PRIMARY KEY REFERENCES contributions(id), title text NOT NULL, body text NOT NULL);
      INSERT INTO contributions(id,author_id,primary_media_item_id,type,status,part_id) VALUES
        (700,700,1,'review','published',null),
        (701,700,1,'review','draft',2);
      INSERT INTO contribution_reviews VALUES (700,'Review','Original body'),(701,'Other','Other body');`);
    const { upsertAuthorReview } = await import("../src/db/queries/contribution-reviews");
    const input = { authorId: 700, contributionId: 700, mediaItemId: 1, title: "Review", body: "Original body", status: "submitted" as const };
    assert.deepEqual(await upsertAuthorReview({ ...input, partId: 1 }), { ok: true, id: 700 });
    const [row] = await db.unsafe("SELECT status,part_id FROM contributions WHERE id=700");
    assert.equal(row.status, "published");
    assert.equal(row.part_id, 1);
    assert.deepEqual(await upsertAuthorReview({ ...input, partId: 2 }), { ok: false, reason: "scope-conflict" });
    assert.deepEqual(await upsertAuthorReview({ ...input, partId: null }), { ok: true, id: 700 });
    assert.deepEqual(await upsertAuthorReview({ ...input, mediaItemId: 2, partId: null }), { ok: false, reason: "not-found" });
    assert.deepEqual(await upsertAuthorReview({ ...input, partId: 999 }), { ok: false, reason: "not-found" });
    const results = await Promise.all([
      upsertAuthorReview({ ...input, partId: 3 }),
      upsertAuthorReview({ ...input, contributionId: 701, title: "Other", body: "Other body", partId: 3 }),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.filter((result) => !result.ok && result.reason === "scope-conflict").length, 1);
  });

  it("ignores cached specials during sync and skips queued specials posters", async () => {
    const { syncProviderTitleParts, getTitlePartPosterSource } = await import("../src/db/queries/title-parts-sync");
    await db.unsafe("UPDATE title_parts SET poster_source_url='https://image.tmdb.org/t/p/w500/special.jpg' WHERE id=999");
    assert.equal(await getTitlePartPosterSource(999, "https://image.tmdb.org/t/p/w500/special.jpg"), null);
    const input = { type: "season" as const, number: 0, externalId: "special", name: "Season Zero", year: null,
      airDate: null, episodeCount: 10, posterSourceUrl: "https://image.tmdb.org/t/p/w500/special.jpg", sortOrder: 0 };
    const result = await appDb!.db.transaction((tx) => syncProviderTitleParts(tx, { mediaItemId: 3, provider: "tmdb", parts: [input] }));
    assert.deepEqual(result.posters, []);
    const [row] = await db.unsafe("SELECT count(*)::int AS n FROM title_parts WHERE media_item_id=3 AND type='season' AND number=0");
    assert.equal(row.n, 0);
  });

})
