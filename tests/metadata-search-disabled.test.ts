import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";

process.env.NODE_PATH = [path.join(process.cwd(), "tests/fixtures/node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
(Module as unknown as { _initPaths: () => void })._initPaths();

// Query generation needs no database connection.
process.env.DATABASE_URL ??= "postgres://localhost/metadata_query_test";

test("metadata opt-out applies to ordinary, explicit, forced and parts-only backfills", async () => {
  const { getMediaItemsMissingMetadataQuery } = await import("../src/db/queries/media-item-metadata");
  for (const input of [{}, { mediaItemId: 5214 }, { force: true, mediaItemId: 5214 }, { partsOnly: true, mediaItemId: 5214 }]) {
    const query = getMediaItemsMissingMetadataQuery(input).toSQL();
    assert.match(query.sql, /"media_items"\."metadata_search_disabled" = \$\d+/);
    assert.ok(query.params.includes(false));
  }
});

test("metadata opt-out applies to the independent anime creator backfill, including force", async () => {
  const { getAnimeMissingCreatorRosterQuery } = await import("../src/db/queries/anilist-creators-backfill");
  for (const force of [false, true]) {
    const query = getAnimeMissingCreatorRosterQuery(25, 0, 5214, force).toSQL();
    assert.match(query.sql, /"media_items"\."metadata_search_disabled" = \$\d+/);
    assert.ok(query.params.includes(false));
  }
});

test("stale metadata refresh preserves the opt-out", () => {
  const source = readFileSync("src/db/queries/media-item-metadata.ts", "utf8");
  const refresh = source.slice(source.indexOf("export async function getMediaItemsStaleMetadata"), source.indexOf("export async function markMediaItemMetadataAttempt"));
  assert.match(refresh, /eq\(mediaItems.metadataSearchDisabled, false\)/);
});
