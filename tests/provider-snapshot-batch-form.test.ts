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
  assert.match(html, /Только без снимков/);
  assert.match(html, /name="onlyMissingSnapshots" checked=""/);
  assert.match(html, /не меняет рабочие поля/);
});

test("book and film network batches restore the missing-snapshot filter", () => {
  for (const provider of ["fantlab", "google-books", "open-library", "tmdb"]) for (const operation of ["refresh", "refresh-process"]) {
    const html = renderToStaticMarkup(createElement(SnapshotBatchForm, { values: { provider, operation, onlyMissingSnapshots: true } }));
    assert.match(html, /name="onlyMissingSnapshots" checked=""/);
  }
});

test("offline processing and verification cannot submit the missing-snapshot filter", () => {
  for (const values of [
    { provider: "fantlab", operation: "process" },
    { provider: "tmdb", operation: "verify" },
    { entityType: "creator", provider: "fantlab", operation: "process" },
  ] as const) {
    const html = renderToStaticMarkup(createElement(SnapshotBatchForm, { values }));
    assert.doesNotMatch(html, /name="onlyMissingSnapshots"/);
  }
});


test("TMDB batches restore the provider and explicitly limit processing to films", () => {
  const html = renderToStaticMarkup(createElement(SnapshotBatchForm, { values: {
    provider: "tmdb", operation: "process",
  } }));
  assert.match(html, /value="tmdb" selected=""/);
  assert.match(html, /value="film" selected=""/);
  assert.match(html, /Фильмы с уже выбранным источником TMDB/);
  const filmProviders = html.match(/<select[^>]*name="provider"[^>]*>(.*?)<\/select>/)?.[1];
  assert.ok(filmProviders);
  assert.doesNotMatch(filmProviders, /value="fantlab"|value="google-books"|value="open-library"/);
  const books = renderToStaticMarkup(createElement(SnapshotBatchForm, { values: {
    provider: "google-books", operation: "process",
  } }));
  assert.match(books, /value="book" selected=""/);
  assert.match(books, /value="google-books" selected=""/);
  const bookProviders = books.match(/<select[^>]*name="provider"[^>]*>(.*?)<\/select>/)?.[1];
  assert.ok(bookProviders);
  assert.doesNotMatch(bookProviders, /value="tmdb"/);
  assert.doesNotMatch(html, /name="onlyMissingSnapshots"/);
  const creators = renderToStaticMarkup(createElement(SnapshotBatchForm, { values: {
    entityType: "creator", provider: "fantlab", operation: "process",
  } }));
  assert.match(creators, /value="tmdb"/);
  assert.match(creators, /Все поддерживаемые источники/);
});


test("TV batches restore explicit series scope with TMDB and all four operations", () => {
  for (const operation of ["refresh", "process", "refresh-process", "verify"] as const) {
    const html = renderToStaticMarkup(createElement(SnapshotBatchForm, { values: { mediaType: "series", provider: "tmdb", operation } }));
    assert.match(html, /value="series" selected=""/);
    assert.match(html, /value="tmdb" selected=""/);
    assert.match(html, /Сериалы с уже выбранным источником TMDB/);
  }
});

test("anime batches restore AniList, all operations and the exact-MAL supplemental scope", () => {
  for (const operation of ["refresh", "process", "refresh-process", "verify"] as const) {
    const html = renderToStaticMarkup(createElement(SnapshotBatchForm, { values: { mediaType: "anime", provider: "anilist", operation } }));
    assert.match(html, /value="anime" selected=""/);
    assert.match(html, /value="anilist" selected=""/);
    assert.match(html, /Jikan через точное соответствие MAL ID/);
    assert.match(html, /режиссёры, производственные компании и продюсеры/);
    assert.match(html, /остальные характеристики записи не меняются/);
    const providers = html.match(/<select[^>]*name="provider"[^>]*>(.*?)<\/select>/)?.[1];
    assert.ok(providers);
    assert.doesNotMatch(providers, /value="tmdb"|value="fantlab"/);
  }
});

test("individual anime snapshot controls submit explicit anime scope and AniList", async () => {
  const { ProviderSnapshotControls } = await import("../src/components/admin/provider-snapshot-controls");
  const html = renderToStaticMarkup(createElement(ProviderSnapshotControls, { mediaItemId: 9, mediaType: "anime", provider: "anilist", showActions: true, canProcess: true }));
  assert.match(html, /name="mediaType" value="anime"/);
  assert.match(html, /name="provider" value="anilist"/);
  assert.match(html, /name="mediaItemId" value="9"/);
  assert.match(html, /остальные характеристики записи не меняются/);
  for (const operation of ["refresh", "process", "refresh-process", "verify"]) assert.match(html, new RegExp(`<button(?=[^>]*name="operation")(?=[^>]*value="${operation}")[^>]*>`));
});
