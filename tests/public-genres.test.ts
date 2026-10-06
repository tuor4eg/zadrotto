import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { paginatePublicGenres } from "../src/lib/media/public-genres";
import { getCatalogCountTier } from "../src/lib/common/catalog-alphabet";
import { GenreCatalog } from "../src/app/genres/genres-catalog";
import { MediaItemGenreLinks } from "../src/components/archive/media-item-genre-links";

const rows = ["Драма", "Action", "Комедия", "12 игр", "# Другое", "Драма"].map((name, index) => ({ id: index + 1, slug: "g-"+index, name, mediaItemsCount: [4,5,19,20,1,2][index], nameMatches: true }));
test("record genres link individually to the archive and empty genres render nothing", () => {
  const html = renderToStaticMarkup(createElement(MediaItemGenreLinks, { genres: rows }));
  assert.equal((html.match(/<a /g) ?? []).length, rows.length);
  for (const genre of rows) assert.ok(html.includes(`href="/archive?genre=${genre.slug}"`));
  assert.ok(html.includes('</a>, <a'));
  assert.equal(renderToStaticMarkup(createElement(MediaItemGenreLinks, { genres: [] })), "");
});
test("genre alphabet, paging and duplicate names preserve distinct identities", () => {
  const first = paginatePublicGenres(rows, { page: 1, pageSize: 2, searchQuery: "" });
  assert.deepEqual(first.availableLetters, ["0-9", "Д", "К", "A", "#"]);
  assert.deepEqual(first.items.map(g => g.id), [4,1]);
  assert.equal(first.totalPages, 3);
  const letter = paginatePublicGenres(rows, { page: 99, pageSize: 24, searchQuery: "", letter: "Д" });
  assert.deepEqual(letter.items.map(g => g.id), [1,6]);
  assert.equal(letter.page, 1);
  assert.equal(paginatePublicGenres(rows, { page: 1, pageSize: 24, searchQuery: "", letter: "Z" }).selectedLetter, undefined);
  const search = paginatePublicGenres(rows.map(g => ({ ...g, nameMatches: g.id === 2 })), { page: 1, pageSize: 24, searchQuery: "action", letter: "Д" });
  assert.deepEqual(search.items.map(g => g.id), [2]);
  assert.equal(search.selectedLetter, undefined);
  assert.equal(search.items[0].mediaItemsCount, 5);
});
test("count tiers and genre links share series presentation", () => {
  assert.deepEqual([4,5,19,20].map(getCatalogCountTier), ["small","medium","medium","large"]);
  const html = renderToStaticMarkup(createElement(GenreCatalog, { items: rows }));
  assert.ok(html.includes("/archive?genre=g-0"));
  for (const style of ["text-base font-medium", "text-xl font-semibold", "text-2xl font-semibold", "size-6", "size-7", "size-9", "lg:columns-2"]) assert.ok(html.includes(style));
  for (const label of ["4 записи", "5 записей", "20 записей", "1 запись"]) assert.ok(html.includes(label));
});


test("selected genre banner renders the current name and a separate clear link", async () => {
  const { ArchiveSelectedGenre } = await import("../src/app/archive/archive-genre-context");
  const html = renderToStaticMarkup(createElement(ArchiveSelectedGenre, {
    genre: { id: 1, slug: "drama", name: "Новое название" }, clearHref: "/archive?type=film",
  }));
  assert.ok(html.includes("Жанр: Новое название"));
  assert.ok(html.includes('href="/archive?type=film"'));
  assert.ok(html.includes("Сбросить выбранный жанр"));
});
