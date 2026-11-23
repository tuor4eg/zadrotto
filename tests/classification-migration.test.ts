import assert from "node:assert/strict";
import test from "node:test";
import { classificationBlockers, classificationHash, classificationRollbackHash, currentClassificationSnapshot, draftClassificationManifest, parseClassificationManifest, publishedMembership, type ClassificationSnapshot } from "../src/lib/classification-migration/model";

function state(): ClassificationSnapshot {
  return {
    franchises: [
      { id: 1, code: "topic", title: "Тема", parent_id: null, publication_status: "published" },
      { id: 2, code: "series", title: "Серия", parent_id: 1, publication_status: "published" },
      { id: 3, code: "pending", title: "Скрытая ветка", parent_id: 1, publication_status: "pending" },
      { id: 4, code: "blocked", title: "Потомок скрытой ветки", parent_id: 3, publication_status: "published" },
    ],
    media_item_franchises: [
      { media_item_id: 10, franchise_id: 1, publication_status: "published" },
      { media_item_id: 10, franchise_id: 2, publication_status: "published" },
      { media_item_id: 11, franchise_id: 2, publication_status: "published" },
      { media_item_id: 12, franchise_id: 4, publication_status: "published" },
      { media_item_id: 13, franchise_id: 1, publication_status: "pending" },
    ],
    media_item_franchise_removal_requests: [], genres: [], achievements: [], tags: [], media_item_tags: [], systemAuthors: [{ id: 99 }], providerLinks: [], foreignKeys: [], archiveSettings: [],
  };
}
function manifest() {
  const result = draftClassificationManifest(state());
  result.series = result.series.map(row => ({ ...row, group: row.id === 1 ? "tag" : "keep", parentId: row.id === 4 ? 3 : null }));
  result.pendingLinks = [{ mediaItemId: 13, franchiseId: 1, decision: "discard" }];
  return result;
}
test("published branch matches recursive CTE semantics and deduplicates membership", () => {
  assert.deepEqual(publishedMembership(state(), 1), [10, 11]);
  assert.deepEqual(publishedMembership(state(), 3), []);
  assert.deepEqual(publishedMembership(state(), 4), [12]);
});
test("unresolved inventory and missing explicit pending decisions fail closed", () => {
  assert.ok(classificationBlockers(state(), draftClassificationManifest(state())).some(value => value.includes("неоднозначные")));
  const approved = manifest();
  assert.deepEqual(classificationBlockers(state(), approved), []);
  approved.pendingLinks = [];
  assert.ok(classificationBlockers(state(), approved).some(value => value.includes("неопубликованные")));
});
test("cycles, dangling parents and duplicated inventory decisions are blocked", () => {
  const input = manifest();
  input.series[1].parentId = 4;
  input.series[2].parentId = 2;
  assert.ok(classificationBlockers(state(), input).some(value => value.includes("Цикл")));
  input.series[1].parentId = 1;
  assert.ok(classificationBlockers(state(), input).some(value => value.includes("должен остаться")));
  input.series.push(input.series[0]);
  assert.ok(classificationBlockers(state(), input).some(value => value.includes("ровно одно")));
});
test("old migration journals retain rollback checks without restoring creator-series links", () => {
  const oldState = state();
  oldState.creator_series = [{ creator_id: 7, series_id: 1 }];
  oldState.foreignKeys = [{ table_name: "creator_series" }, { table_name: "franchises" }];
  const current = currentClassificationSnapshot(oldState);
  const proof = { membership: {}, progress: [] };
  assert.equal(Object.hasOwn(current, "creator_series"), false);
  assert.deepEqual(current.foreignKeys, [{ table_name: "franchises" }]);
  assert.equal(classificationRollbackHash({ state: current, proof }, oldState), classificationHash({ state: oldState, proof }));
  current.tags = [{ id: 999 }];
  assert.notEqual(classificationRollbackHash({ state: current, proof }, oldState), classificationHash({ state: oldState, proof }));
});
test("normalized title conflicts, snapshot references and unknown FK dependencies block conversion", () => {
  const snapshot = state(); snapshot.tags.push({ id: 9, code: "other", title: " ТЕМА " });
  snapshot.providerLinks.push({ entity_id: "1" });
  snapshot.foreignKeys.push({ table_name: "new_dependency" });
  const errors = classificationBlockers(snapshot, manifest());
  assert.ok(errors.some(value => value.includes("Название тега")));
  assert.ok(errors.some(value => value.includes("снимки")));
  assert.ok(errors.some(value => value.includes("неизвестная внешняя")));
});
test("manifest parsing rejects coerced IDs and unknown fields; hash includes decisions", () => {
  assert.deepEqual(parseClassificationManifest(manifest()), manifest());
  const input = JSON.parse(JSON.stringify(manifest())); input.series[0].id = "1";
  assert.throws(() => parseClassificationManifest(input));
  assert.throws(() => parseClassificationManifest({ ...manifest(), unsafe: true }));
  assert.equal(classificationHash({ a: 1, b: 2 }), classificationHash({ b: 2, a: 1 }));
  assert.notEqual(classificationHash(manifest()), classificationHash({ ...manifest(), pendingLinks: [] }));
});

test("explicit matching accepts an existing tag and still rejects unknown targets", () => {
  const snapshot = state(); snapshot.tags = [{ id: 55, code: "existing", title: "ТЕМА" }];
  const input = manifest(); input.series[0].tagId = 55;
  assert.deepEqual(parseClassificationManifest(input), input);
  assert.deepEqual(classificationBlockers(snapshot, input), []);
  input.series[0].tagId = 56;
  assert.ok(classificationBlockers(snapshot, input).some(value => value.includes("не найден")));
  input.series[1].tagId = 55;
  assert.throws(() => parseClassificationManifest(input));
});

test("an unknown FK from a known table is still a blocker", () => {
  const snapshot = state(); snapshot.foreignKeys = [{ table_name: "genres", column_names: ["other_series_id"], target_table: "franchises", target_columns: ["id"], delete_action: "c" }];
  assert.ok(classificationBlockers(snapshot, manifest()).some(value => value.includes("неизвестная внешняя")));
});
