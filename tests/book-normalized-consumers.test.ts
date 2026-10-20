import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { mediaMetadataFactsSql } from "@/db/queries/book-metadata";
import { parseBookProviders } from "@/lib/providers/book-cutover";

test("normalized book cutover defaults to legacy and validates configured providers", () => {
  assert.deepEqual(parseBookProviders(""), []);
  assert.deepEqual(parseBookProviders("fantlab, google-books,fantlab"), ["fantlab", "google-books"]);
  assert.throws(() => parseBookProviders("tmdb"), /configuration/);
});

test("book consumer projection reads working relations and keeps legacy branch without snapshot queries", () => {
    const compiled = new PgDialect().sqlToQuery(mediaMetadataFactsSql());
    assert.match(compiled.sql, /entry_creators/);
    assert.match(compiled.sql, /source_position/);
    assert.match(compiled.sql, /original_language/);
    assert.match(compiled.sql, /else "media_item_metadata"\."facts" end/);
    assert.doesNotMatch(compiled.sql, /provider_snapshots/);
    assert.match(compiled.sql, /provider_settings/);
    assert.match(compiled.sql, /normalized_book_metadata/);
    assert.ok(compiled.params.includes("writer"));
    assert.ok(compiled.params.includes("publisher"));
});
