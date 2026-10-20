import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Module, { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let SnapshotBatchForm: typeof import("../src/app/admin/(protected)/tools/providers/snapshots/snapshot-batch-form").SnapshotBatchForm;
const require = createRequire(import.meta.url);
const actionsPath = require.resolve("../src/app/admin/(protected)/tools/providers/snapshots/actions");
const previousActions = require.cache[actionsPath];

before(async () => {
  // Reproduce Next's server action reference boundary without running auth/DB code.
  const actions = new Module(actionsPath);
  actions.filename = actionsPath;
  actions.loaded = true;
  actions.exports = { enqueueProviderSnapshotAction: () => assert.fail("Rendering must not enqueue jobs") };
  require.cache[actionsPath] = actions;
  ({ SnapshotBatchForm } = await import("../src/app/admin/(protected)/tools/providers/snapshots/snapshot-batch-form"));
});
after(() => { if (previousActions) require.cache[actionsPath] = previousActions; else delete require.cache[actionsPath]; });

test("creator network batches expose the missing-snapshot option and restore it from a saved run", () => {
  const html = renderToStaticMarkup(createElement(SnapshotBatchForm, { values: {
    entityType: "creator", provider: "fantlab", operation: "refresh-process", onlyMissingSnapshots: true,
  } }));
  assert.match(html, /Только без сохранённого снимка/);
  assert.match(html, /name="onlyMissingSnapshots" checked=""/);
  assert.match(html, /независимо от заполненности полей создателя/);
});

test("books and offline processing cannot submit the missing-snapshot filter", () => {
  for (const values of [
    { provider: "fantlab", operation: "refresh" },
    { entityType: "creator", provider: "fantlab", operation: "process" },
  ] as const) {
    const html = renderToStaticMarkup(createElement(SnapshotBatchForm, { values }));
    assert.doesNotMatch(html, /name="onlyMissingSnapshots"/);
  }
});
