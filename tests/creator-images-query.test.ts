import assert from "node:assert/strict";
import { test } from "node:test";
import { creatorImagesBatchQuery, creatorImagesScopeQuery } from "../src/db/queries/creator-images";
import { creatorImageBindingsQuery, creatorImageStateQuery } from "../src/db/queries/creator-image-commit";

// Compile the actual Drizzle queries; no connection or fixture writes.
test("image batches keep filters in SQL, use keysets and avoid role/binding fan-out", () => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@localhost:1/unused";
  const input = { batchSize: 25, creatorTypeId: 1, roleId: 3 };
  const scope = creatorImagesScopeQuery(input).toSQL();
  const batch = creatorImagesBatchQuery({ ...input, afterId: 50, throughId: 900 }).toSQL();
  assert.match(scope.sql, /count\(\*\)/);
  assert.match(batch.sql, /exists \(select 1 from entry_creators/);
  assert.match(batch.sql, /exists \(select "id" from "provider_creator_bindings"/);
  assert.match(batch.sql, /"creators"\."id" > \$/);
  assert.match(batch.sql, /"creators"\."id" <= \$/);
  assert.match(batch.sql, /order by "creators"\."id" asc limit \$/);
  assert.doesNotMatch(batch.sql, /offset|join "entry_creators"|join "provider_creator_bindings"/i);
  assert.ok(batch.params.includes(3));
  assert.equal(batch.params.at(-1), 26);
  const unfiltered = creatorImagesBatchQuery({ batchSize: 1, afterId: 0, throughId: 900 }).toSQL();
  assert.doesNotMatch(unfiltered.sql, /entry_creators/);
  assert.match(creatorImageBindingsQuery(42).toSQL().sql, /"creator_id" = \$/);
  assert.match(creatorImageStateQuery(42).toSQL().sql, /"creators"\."id" = \$/);
});
