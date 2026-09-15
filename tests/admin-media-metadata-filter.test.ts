import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const query = readFileSync("src/db/queries/media-items.ts", "utf8");
const page = readFileSync("src/app/admin/(protected)/media/page.tsx", "utf8");
const filters = readFileSync("src/app/admin/(protected)/media/media-filters-form.tsx", "utf8");
const migration = readFileSync("drizzle/0087_media_metadata_issue.sql", "utf8");
const metadataQuery = readFileSync("src/db/queries/media-item-metadata.ts", "utf8");

test("metadata filters share the same missing-facts condition, with an attempt required only for not found", () => {
  assert.match(query, /if \(input\.metadataFilter\) \{\s*if \(input\.metadataFilter === "missing"\) \{\s*conditions\.push\(isNotNull\(mediaItems\.metadataAttemptedAt\)\)/);
  assert.match(query, /not exists \([\s\S]*mediaItemMetadata\.facts\} <> '\{\}'::jsonb/);
  assert.match(query, /const filterCondition = adminMediaFilterConditions\(input\);[\s\S]*count\(\*\)::int[\s\S]*\.where\(filterCondition\);[\s\S]*\.where\(filterCondition\)/);
});

test("catalog preserves the metadata filter through other filters, pagination, and reset", () => {
  assert.match(filters, /updateFilterParam\(nextSearchParams, "metadata"/);
  assert.match(filters, /<option value="absent">Метаданные отсутствуют<\/option>/);
  assert.match(filters, /<option value="missing">Метаданные не найдены<\/option>/);
  assert.match(filters, /router\.replace\(pathname, \{ scroll: false \}\)/);
  assert.match(page, /metadata: metadataFilter \?\? undefined/);
  assert.match(page, /metadataFilter=\{metadataFilter\}/);
  assert.match(page, /<AdminMetadataIssue item=\{item\} \/>/g);
  assert.match(page, /Метаданные отсутствуют" : "Метаданные не найдены"\}: \{mediaResult\.totalCount\}/);
  assert.match(migration, /metadata_issue_code/);
  assert.match(metadataQuery, /Object\.keys\(input\.facts\)\.length > 0[\s\S]*metadataIssueCode: null/);
});
