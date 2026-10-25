import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { publishedSeriesMembershipSql } from "../src/db/queries/series-membership";

const dialect = new PgDialect();
const membership = (descendants?: boolean) => dialect.sqlToQuery(
  publishedSeriesMembershipSql(sql`media_items.id`, sql`${42}`, descendants),
);

test("series includes the published subtree by default; direct mode excludes recursion", () => {
  const branch = membership();
  assert.match(branch.sql, /with recursive published_branch/);
  assert.match(branch.sql, /child.publication_status/);
  const direct = membership(false);
  assert.doesNotMatch(direct.sql, /recursive|published_branch/);
  assert.match(direct.sql, /series_link.franchise_id = \$1/);
  assert.match(direct.sql, /series_link.media_item_id = media_items.id/);
  assert.match(direct.sql, /series_link.publication_status/);
  assert.match(direct.sql, /series.publication_status/);
  assert.deepEqual(direct.params, [42, "published", "published"]);
});

test("catalog list and tab counts share the requested descendants filter", () => {
  const source = readFileSync("src/app/archive/page.tsx", "utf8");
  assert.equal(source.match(/includeSeriesDescendants: params.seriesChildren !== "0"/g)?.length, 2);
  const queries = readFileSync("src/db/queries/media-items.ts", "utf8");
  assert.match(queries, /catalogSeriesCondition\(input.seriesId, input.includeSeriesDescendants\)/);
  assert.match(source, /key !== "page"/);
  assert.match(source, /next.delete\("seriesChildren"\)/);
  const catalog = readFileSync("src/app/media-items-catalog.tsx", "utf8");
  assert.match(catalog, /seriesChildren: seriesCode && searchParams.get\("seriesChildren"\) === "0"/);
});

test("only series with visible descendants show an accessible switch", () => {
  const source = readFileSync("src/app/archive/archive-series-context.tsx", "utf8");
  assert.match(source, /childSeries.length > 0 \? \(\s*<ArchiveSeriesDescendantsToggle/);
  const toggle = readFileSync("src/app/archive/archive-series-descendants-toggle.tsx", "utf8");
  assert.match(toggle, /role="switch"/);
  assert.match(toggle, /aria-checked=\{checked\}/);
  assert.match(toggle, /disabled=\{pending\}/);
});
