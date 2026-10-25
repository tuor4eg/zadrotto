import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { latestJobRunsByTypesQuery, mapLatestJobRun } from "../src/db/queries/jobs";
import { genreSeriesCandidatesQuery } from "../src/db/queries/genre-series-backfill";
import { parseGenreSeriesPayload } from "../src/lib/media/genre-series-job";

test("latest migrations use one indexed lateral top-one probe per type", () => {
  const types = ["media.tmdb-companies-backfill", "media.tmdb-directors-backfill"];
  const query = new PgDialect().sqlToQuery(latestJobRunsByTypesQuery(types));
  assert.match(query.sql, /unnest\(\$1::text\[\]\)/);
  assert.deepEqual(query.params[0], types);
  assert.match(query.sql, /cross join lateral/);
  assert.match(query.sql, /where type=requested.type/);
  assert.match(query.sql, /order by created_at desc,id desc limit 1/);
});
test("subject series application is bounded, scoped and keeps the legacy global migration separate", () => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@localhost:1/unused";
  const query = genreSeriesCandidatesQuery({ genreId: 7, afterId: 10, throughId: 900, limit: 25 }).toSQL();
  assert.match(query.sql, /g.id=\$/);
  assert.match(query.sql, /mg.media_item_id="media_items"\."id"/);
  assert.match(query.sql, /series_link.media_item_id = "media_items"\."id"/);
  assert.match(query.sql, /"media_items"\."id" > \$/);
  assert.match(query.sql, /"media_items"\."id" <= \$/);
  assert.equal(query.params.at(-1), 26);
  assert.ok(query.params.includes(7));
  assert.deepEqual(parseGenreSeriesPayload({ genreId: 7 }), { genreId: 7, afterId: 0, processed: 0, updated: 0, applied: 0 });
  for (const value of [{}, { genreId: 0 }, { genreId: 7, force: true }, { genreId: 7, afterId: -1 }]) assert.throws(() => parseGenreSeriesPayload(value));
});

test("raw migration timestamps are decoded before the page formats them", () => {
  const base = { id: 42, type: "media.tmdb-directors-backfill", status: "succeeded" };
  for (const scheduledFor of ["2026-10-23 12:34:56.123+00", new Date("2026-10-23T12:34:56.123Z")]) {
    const mapped = mapLatestJobRun({ ...base, scheduledFor });
    assert.ok(mapped.scheduledFor instanceof Date);
    assert.equal(mapped.scheduledFor.toISOString(), "2026-10-23T12:34:56.123Z");
    assert.equal(mapped.id, 42);
    assert.equal(mapped.type, base.type);
  }
});
