import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { paginatePublicPlatforms } from "../src/lib/media/public-platforms";
import { getCatalogCountTier } from "../src/lib/common/catalog-alphabet";
import { PlatformCatalog } from "../src/app/platforms/platforms-catalog";
import { MediaItemPlatformLinks } from "../src/components/archive/media-item-platform-links";

const rows = ["Драма", "Action", "Комедия", "12 игр", "# Другое", "Драма"].map((name, index) => ({ id: index + 1, slug: "g-"+index, name, mediaItemsCount: [4,5,19,20,1,2][index], nameMatches: true }));
test("record platforms link individually to the archive and empty platforms render nothing", () => {
  const html = renderToStaticMarkup(createElement(MediaItemPlatformLinks, { platforms: rows }));
  assert.equal((html.match(/<a /g) ?? []).length, rows.length);
  for (const platform of rows) assert.ok(html.includes(`href="/archive?platform=${platform.slug}"`));
  assert.ok(html.includes('</a>, <a'));
  assert.equal(renderToStaticMarkup(createElement(MediaItemPlatformLinks, { platforms: [] })), "");
});
test("platform alphabet, paging and duplicate names preserve distinct identities", () => {
  const first = paginatePublicPlatforms(rows, { page: 1, pageSize: 2, searchQuery: "" });
  assert.deepEqual(first.availableLetters, ["0-9", "Д", "К", "A", "#"]);
  assert.deepEqual(first.items.map(g => g.id), [4,1]);
  assert.equal(first.totalPages, 3);
  const letter = paginatePublicPlatforms(rows, { page: 99, pageSize: 24, searchQuery: "", letter: "Д" });
  assert.deepEqual(letter.items.map(g => g.id), [1,6]);
  assert.equal(letter.page, 1);
  assert.equal(paginatePublicPlatforms(rows, { page: 1, pageSize: 24, searchQuery: "", letter: "Z" }).selectedLetter, undefined);
  const search = paginatePublicPlatforms(rows.map(g => ({ ...g, nameMatches: g.id === 2 })), { page: 1, pageSize: 24, searchQuery: "action", letter: "Д" });
  assert.deepEqual(search.items.map(g => g.id), [2]);
  assert.equal(search.selectedLetter, undefined);
  assert.equal(search.items[0].mediaItemsCount, 5);
});
test("count tiers and platform links share series presentation", () => {
  assert.deepEqual([4,5,19,20].map(getCatalogCountTier), ["small","medium","medium","large"]);
  const html = renderToStaticMarkup(createElement(PlatformCatalog, { items: rows }));
  assert.ok(html.includes("/archive?platform=g-0"));
  for (const style of ["text-base font-medium", "text-xl font-semibold", "text-2xl font-semibold", "size-6", "size-7", "size-9", "lg:columns-2"]) assert.ok(html.includes(style));
  for (const label of ["4 записи", "5 записей", "20 записей", "1 запись"]) assert.ok(html.includes(label));
});


test("selected platform banner renders the current name and a separate clear link", async () => {
  const { ArchiveSelectedPlatform } = await import("../src/app/archive/archive-platform-context");
  const html = renderToStaticMarkup(createElement(ArchiveSelectedPlatform, {
    platform: { id: 1, slug: "drama", name: "Новое название" }, clearHref: "/archive?type=film",
  }));
  assert.ok(html.includes("Платформа: Новое название"));
  assert.ok(html.includes('href="/archive?type=film"'));
  assert.ok(html.includes("Сбросить выбранную платформу"));
  assert.doesNotMatch(html, /href="\/admin\/platforms\//);
  const adminHtml = renderToStaticMarkup(createElement(ArchiveSelectedPlatform, {
    platform: { id: 1, slug: "drama", name: "Драма" }, clearHref: "/archive", adminCanEdit: true,
  }));
  assert.match(adminHtml, /href="\/admin\/platforms\/1\/edit"/);
  assert.match(adminHtml, /aria-label="Редактировать платформу Драма"/);
});


test("saved metadata displays normalized platform links without raw provider fallback", async () => {
  const { MediaMetadataFacts } = await import("../src/components/ui/media-metadata-facts");
  const metadata = { facts: { platforms: ["PC (Microsoft Windows)", "Linux"] }, sourceProvider: null, sourceExternalId: null, sourceUrl: null };
  assert.equal(renderToStaticMarkup(createElement(MediaMetadataFacts, { metadata })), "");
  const html = renderToStaticMarkup(createElement(MediaMetadataFacts, { metadata: { ...metadata, platforms: [{ id: 1, name: "PC", slug: "pc" }] } }));
  assert.match(html, /href="\/archive\?platform=pc"/);
  assert.doesNotMatch(html, /Microsoft Windows|Linux/);
  const diagnostics = renderToStaticMarkup(createElement(MediaMetadataFacts, { metadata, showProviderGenres: true }));
  assert.match(diagnostics, /Платформы провайдера/);
  assert.match(diagnostics, /PC \(Microsoft Windows\), Linux/);
});
