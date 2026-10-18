import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/pg-proxy";

import { mediaItemDisplayAliasesSql } from "../src/db/queries/media-item-display-titles";
import { mediaItems } from "../src/db/schema";

test("display aliases stay correlated to the outer record in a single-table query", () => {
  const db = drizzle(async () => ({ rows: [] }));
  const query = db.select({
    title: mediaItems.title,
    aliases: mediaItemDisplayAliasesSql(),
  }).from(mediaItems).toSQL();

  assert.match(query.sql, /where "media_item_id" = "media_items"\."id"/);
});
