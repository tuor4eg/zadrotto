import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { sitemapBucketsQuery, sitemapEntriesQuery } from "../src/db/queries/seo-sitemap";
import { SITEMAP_CATEGORIES } from "../src/lib/seo/sitemap";

const dialect = new PgDialect();

test("every sitemap query bounds projected entity IDs without pagination offsets", () => {
  for (const category of SITEMAP_CATEGORIES) {
    const query = dialect.sqlToQuery(sitemapEntriesQuery(category, 2));
    assert.match(query.sql, /select e.id, .* as key, e.updated_at as "updatedAt"/);
    assert.match(query.sql, /e.id >= \$\d+ and e.id <= \$\d+/);
    assert.match(query.sql, /order by e.id limit \$\d+$/);
    assert.ok(query.params.includes(20001));
    assert.ok(query.params.includes(30000));
    assert.equal(query.params.at(-1), 10000);
    assert.doesNotMatch(query.sql, /\boffset\b|select \*/i);
  }
});

test("index groups existing visible buckets and membership queries preserve guest predicates", () => {
  const query = dialect.sqlToQuery(sitemapBucketsQuery());
  assert.equal(query.sql.match(/group by 2/g)?.length, 7);
  assert.equal(query.sql.match(/union all/g)!.length >= 6, true);
  assert.doesNotMatch(query.sql, /generate_series|tier_lists|quizzes/);
  for (const category of ["media", "reviews", "genres", "platforms", "creators"] as const) {
    const sql = dialect.sqlToQuery(sitemapEntriesQuery(category, 0)).sql;
    assert.match(sql, /is_publicly_available/);
    assert.match(sql, /publication_status='published'/);
  }
  const creators = dialect.sqlToQuery(sitemapEntriesQuery("creators", 0)).sql;
  assert.match(creators, /membership join media_items m on m.id=membership.entry_id/);
  assert.match(creators, /pseudonym_of/);
  assert.match(creators, /entry_creator_pseudonyms/);
  assert.match(dialect.sqlToQuery(sitemapEntriesQuery("genres", 0)).sql, /replacement_franchise_id/);
});
