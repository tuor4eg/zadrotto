import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildFeedQuery } from "../src/db/queries/feed";

const dialect = new PgDialect();

test("tier-list public feed requires first publication and an active visible author", () => {
  const query = dialect.sqlToQuery(buildFeedQuery({ mediaTypeCodes: [], publicOnly: true }));
  assert.match(query.sql, /tier_lists\.status='published' and tier_lists\.hidden_at is null/);
  assert.match(query.sql, /tier_lists\.first_published_at is not null/);
  assert.match(query.sql, /tier_author\.blocked_at is null/);
  assert.match(query.sql, /tier_author\.merged_into_author_id is null/);
  assert.doesNotMatch(query.sql, /not tier_author\.is_system/);
  assert.match(query.sql, /account\.status <> 'active'/);
  assert.match(query.sql, /tier_lists\.first_published_at/);
  assert.doesNotMatch(query.sql, /tier_lists\.(updated_at|created_at)/);
  assert.match(query.sql, /t\.public_id::text/);
  assert.match(query.sql, /case when t\.preview_version=t\.version then t\.preview_object_key else null end/);
});

test("tier-list personal filters scope the bounded publication branch to actor IDs", () => {
  for (const filter of [{ friendsOnly: true }, { mineOnly: true }, { friendId: 42 }]) {
    const query = dialect.sqlToQuery(buildFeedQuery({ mediaTypeCodes: [], authorId: 7, ...filter,
      position: { direction: "older", cursor: { at: "2026-11-09T10:00:00.123456Z", id: 17, kind: 8 } } }));
    assert.match(query.sql, /tier_lists\.author_id=f\.id/);
    assert.match(query.sql, /tier_lists\.first_published_at, \$\d+::int, tier_lists\.id\) </);
    assert.ok(query.params.includes(8));
    assert.ok(query.params.includes("2026-11-09T10:00:00.123456Z"));
  }
});
