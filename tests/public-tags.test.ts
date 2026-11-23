import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { paginatePublicTags } from "../src/lib/tags/public-tags";
import { TagCatalog } from "../src/app/tags/tags-catalog";

const rows = ["Драма", "Action", "Комедия"].map((title, index) => ({ id: index + 1, code: `tag-${index}`, title, mediaItemsCount: index + 1, nameMatches: true }));
test("tag catalog paginates, selects letters and resets letter during search", () => {
  const page = paginatePublicTags(rows, { page: 1, pageSize: 2, searchQuery: "" });
  assert.equal(page.items.length, 2);
  assert.equal(page.totalPages, 2);
  assert.deepEqual(page.availableLetters, ["Д", "К", "A"]);
  assert.deepEqual(paginatePublicTags(rows, { page: 99, pageSize: 24, searchQuery: "", letter: "Д" }).items.map(row => row.title), ["Драма"]);
  const search = paginatePublicTags(rows.map(row => ({ ...row, nameMatches: row.id === 2 })), { page: 1, pageSize: 24, searchQuery: "action", letter: "Д" });
  assert.equal(search.selectedLetter, undefined);
  assert.deepEqual(search.items.map(row => row.code), ["tag-1"]);
  assert.equal(paginatePublicTags([], { page: 99, pageSize: 24, searchQuery: "" }).page, 1);
});
test("tag catalog uses archive tag links and shared count presentation", () => {
  const html = renderToStaticMarkup(createElement(TagCatalog, { items: rows }));
  assert.match(html, /href="\/archive\?tag=tag-0"/);
  assert.match(html, /lg:columns-2/);
  assert.match(html, /1 запись/);
  assert.match(html, /Драма/);
});

test("tag search matches appear inside the shared archive matches panel", async () => {
  const { ArchiveSeriesMatches } = await import("../src/app/archive/archive-series-context");
  const html = renderToStaticMarkup(createElement(ArchiveSeriesMatches, {
    items: [], totalCount: 0, moreHref: "/series", selectionHrefs: {},
    tags: [{ id: 1, code: "drama", title: "Драма" }],
    tagSelectionHrefs: { 1: "/archive?type=film&tag=drama" },
    tagMoreHref: "/tags?q=драма",
  }));
  assert.match(html, /aria-label="Совпадения по поиску"/);
  assert.match(html, /Совпадения в тегах/);
  assert.match(html, /href="\/archive\?type=film&amp;tag=drama"/);
  assert.match(html, /aria-label="Посмотреть в тегах"/);
  assert.doesNotMatch(html, /Найденные теги|rounded-full/);
});
