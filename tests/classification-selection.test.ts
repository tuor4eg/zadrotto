import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClassificationSeriesTree, ClassificationSelectionState, ClassificationApplyControls } from "../src/app/admin/(protected)/tools/jobs/migrations/classification-series-tree";
import { classificationManifestFromSelection, classificationSearchVisibility, classificationTree, initialKeptSeriesIds, retainedParentId } from "../src/lib/classification-migration/selection";
import type { ClassificationSnapshot } from "../src/lib/classification-migration/model";

function snapshot(): ClassificationSnapshot {
  return { franchises: [
    { id: 1, title: "Вселенная", parent_id: null },
    { id: 2, title: "Тематика", parent_id: 1 },
    { id: 3, title: "Подтематика", parent_id: 2 },
    { id: 4, title: "Цикл", parent_id: 3 },
    { id: 5, title: "Подцикл", parent_id: 4 },
  ], tags: [{ id: 10, title: "Тематика" }], creator_series: [], media_item_franchises: [], media_item_franchise_removal_requests: [], genres: [], achievements: [], systemAuthors: [], providerLinks: [], foreignKeys: [], archiveSettings: [], media_item_tags: [] };
}
function form(...ids: number[]) { const data = new FormData(); for (const id of ids) data.append("keepSeriesId", String(id)); return data; }

test("initial selection keeps all nodes; clearing a parent never changes child decisions", () => {
  const series = [{ id: 1, title: "Тема", parentId: null }, { id: 2, title: "Цикл", parentId: 1 }];
  assert.deepEqual(initialKeptSeriesIds(series), [1, 2]);
  const manifest = classificationManifestFromSelection(snapshot(), form(1, 4, 5));
  assert.deepEqual(manifest.series, [
    { id: 1, group: "keep", parentId: null }, { id: 2, group: "tag", parentId: null },
    { id: 3, group: "tag", parentId: null }, { id: 4, group: "keep", parentId: 1 },
    { id: 5, group: "keep", parentId: 4 },
  ]);
  assert.deepEqual(initialKeptSeriesIds(series, manifest), [1, 4, 5]);
});

test("kept descendants become roots when every ancestor is converted; all topics is valid", () => {
  assert.equal(classificationManifestFromSelection(snapshot(), form(4)).series.find(row => row.id === 4)?.parentId, null);
  assert.equal(classificationManifestFromSelection(snapshot(), form()).series.every(row => row.group === "tag" && row.parentId === null), true);
  assert.throws(() => retainedParentId(new Map([[1, 2], [2, 1]]), 1, new Set()), /цикл/);
});

test("selection rejects invalid series and always creates one tag per converted series", () => {
  for (const data of [form(9), form(1, 1), form(1.1)]) assert.throws(() => classificationManifestFromSelection(snapshot(), data));
  const data = form(1, 4, 5);
  data.set("tagFor:2", "10");
  const converted = classificationManifestFromSelection(snapshot(), data).series.filter(row => row.group === "tag");
  assert.deepEqual(converted, [{ id: 2, group: "tag", parentId: null }, { id: 3, group: "tag", parentId: null }]);
});

test("dependencies require explicit controls and preserve decisions for kept series", () => {
  const state = snapshot();
  state.creator_series = [{ creator_id: 8, series_id: 2 }, { creator_id: 9, series_id: 4 }];
  state.media_item_franchises = [{ media_item_id: 20, franchise_id: 2, publication_status: "submitted" }, { media_item_id: 21, franchise_id: 4, publication_status: "private" }];
  state.media_item_franchise_removal_requests = [{ media_item_id: 22, franchise_id: 2 }];
  const data = form(1, 4, 5);
  assert.throws(() => classificationManifestFromSelection(state, data));
  data.set("creatorTarget:8:2", "3"); assert.throws(() => classificationManifestFromSelection(state, data));
  data.set("creatorTarget:8:2", "4"); data.set("pending:20:2", "discard");
  assert.throws(() => classificationManifestFromSelection(state, data));
  data.set("removal:22:2", "discard");
  const result = classificationManifestFromSelection(state, data);
  assert.deepEqual(result.creatorLinks, [{ creatorId: 8, seriesId: 2, targetSeriesId: 4 }]);
  assert.deepEqual(result.pendingLinks, [{ mediaItemId: 20, franchiseId: 2, decision: "discard" }]);
  assert.deepEqual(result.removalRequests, [{ mediaItemId: 22, franchiseId: 2, decision: "discard" }]);
  data.set("creatorTarget:8:2", "remove");
  assert.equal(classificationManifestFromSelection(state, data).creatorLinks[0].targetSeriesId, null);
});

test("tree shows original nesting and handles orphaned or cyclic branches without hiding nodes", () => {
  const tree = classificationTree([{ id: 2, title: "Цикл", parentId: 1 }, { id: 1, title: "Мир", parentId: null }]);
  assert.equal(tree.length, 1); assert.equal(tree[0].children[0].id, 2);
  const damaged = classificationTree([{ id: 1, title: "А", parentId: 2 }, { id: 2, title: "Б", parentId: 1 }, { id: 3, title: "В", parentId: 99 }]);
  const ids = (rows: typeof damaged): number[] => rows.flatMap(row => [row.id, ...ids(row.children)]);
  assert.deepEqual(ids(damaged).sort(), [1, 2, 3]);
});


test("editor renders checked retained nodes, unchecked topics and ordinary confirmation controls", () => {
  const html = renderToStaticMarkup(createElement(ClassificationSelectionState, null,
    createElement("form", null,
      createElement(ClassificationSeriesTree, {
        series: [{ id: 1, title: "Тематика", parentId: null }, { id: 2, title: "Франшиза", parentId: 1 }],
        initialKeptIds: [2], creatorLinks: [], pendingLinks: [], removalRequests: [],
      }),
      createElement(ClassificationApplyControls, { disabled: true }),
    )));
  const inputs = html.match(/<input[^>]*>/g) ?? [];
  assert.equal(inputs.some(input => input.includes('name="keepSeriesId"') && input.includes('value="1"') && !input.includes('checked=""')), true);
  assert.equal(inputs.some(input => input.includes('name="keepSeriesId"') && input.includes('value="2"') && input.includes('checked=""')), true);
  assert.match(html, /→ в теги/);
  assert.match(html, /В корне каталога/);
  assert.match(html, /Посмотреть результат/);
  assert.doesNotMatch(html, /textarea|JSON|parentId|tagMappings|tagFor:/);
  assert.equal(inputs.some(input => input.includes('name="confirmation"') && input.includes('disabled=""')), true);
});

test("migration search normalizes names and keeps ancestors without including unrelated branches", () => {
  const tree = classificationTree([
    { id: 1, title: "Вселенная", parentId: null },
    { id: 2, title: "  Ёж   и ель ", parentId: 1 },
    { id: 3, title: "Другая ветка", parentId: 1 },
    { id: 4, title: "Отдельная серия", parentId: null },
  ]);
  assert.deepEqual([...classificationSearchVisibility(tree, "ЕЖ  И ЕЛЬ")].sort(), [1, 2]);
  assert.equal(classificationSearchVisibility(tree, "несуществующая").size, 0);
  assert.deepEqual([...classificationSearchVisibility(tree, "  ")].sort(), [1, 2, 3, 4]);
});
