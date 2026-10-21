import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { mediaMetadataFactsSql } from "@/db/queries/book-metadata";
import { bookSnapshotProviderSql } from "@/db/queries/book-metadata";

test("book snapshot support is fixed independently of runtime settings", () => {
  const compiled = new PgDialect().sqlToQuery(bookSnapshotProviderSql());
  assert.match(compiled.sql, /in \('fantlab', 'google-books', 'open-library'\)/);
  assert.doesNotMatch(compiled.sql, /provider_settings/);
});

test("book consumer projection reads working relations with a fixed provider contract without snapshot queries", () => {
    const compiled = new PgDialect().sqlToQuery(mediaMetadataFactsSql());
    assert.match(compiled.sql, /entry_creators/);
    assert.match(compiled.sql, /source_position/);
    assert.doesNotMatch(compiled.sql, /original_language/);
    assert.match(compiled.sql, /originalLanguage/);
    assert.match(compiled.sql, /else "media_item_metadata"\."facts" end/);
    assert.doesNotMatch(compiled.sql, /provider_snapshots/);
    assert.doesNotMatch(compiled.sql, /provider_settings/);
    assert.doesNotMatch(compiled.sql, /normalized_book_metadata/);
    assert.match(compiled.sql, /fantlab.*google-books.*open-library/);
    assert.ok(compiled.params.includes("writer"));
    assert.ok(compiled.params.includes("publisher"));
});
