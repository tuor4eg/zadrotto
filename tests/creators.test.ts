import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { extractExternalCreators, extractFantlabCreatorReferences } from "../src/lib/media/creators";
import { MediaItemCreatorLinks } from "../src/components/archive/media-item-creator-links";
import { ArchiveSelectedCreator } from "../src/app/archive/archive-creator-context";
import { MediaMetadataFacts } from "../src/components/ui/media-metadata-facts";
import { formatMediaItemSummary } from "../src/lib/media/media-item-summary";

test("creator extraction normalizes names and preserves individual comma-containing names", () => {
  assert.deepEqual(extractExternalCreators({ authors: ["  ЁЖ   Иван  ", "еж Иван", "King, Stephen", " ", "Jane Doe"] }), [
    { name: "ЁЖ   Иван", normalizedName: "еж иван" },
    { name: "King, Stephen", normalizedName: "king, stephen" },
    { name: "Jane Doe", normalizedName: "jane doe" },
  ]);
  assert.deepEqual(extractExternalCreators({ authors: "King, Stephen" }), [{ name: "King, Stephen", normalizedName: "king, stephen" }]);
  for (const facts of [{}, { authors: null }, { authors: [] }, { authors: "  " }]) assert.deepEqual(extractExternalCreators(facts), []);
  for (const authors of [42, {}, ["Valid", null], ["Valid", 2]]) assert.throws(() => extractExternalCreators({ authors }));
});

test("linked creators retain distinct identities and encode archive filters", () => {
  const html = renderToStaticMarkup(createElement(MediaItemCreatorLinks, { creators: [
    { id: 1, slug: "king", name: "Стивен Кинг" }, { id: 2, slug: "name with space", name: "Другой" },
  ] }));
  assert.match(html, /href="\/archive\?creator=king"/);
  assert.match(html, /href="\/archive\?creator=name%20with%20space"/);
  assert.match(html, /<\/a>, <a/);
  assert.equal(renderToStaticMarkup(createElement(MediaItemCreatorLinks, { creators: [] })), "");
});

test("creator banner links related series independently and preserves the supplied clear URL", () => {
  const html = renderToStaticMarkup(createElement(ArchiveSelectedCreator, { creator: {
    id: 1, name: "Стивен Кинг", series: [{ id: 1, code: "dark-tower", title: "Тёмная башня" }],
  }, clearHref: "/archive?type=book&q=king" }));
  assert.match(html, /Создатель: Стивен Кинг/);
  assert.match(html, /href="\/archive\?series=dark-tower"/);
  assert.doesNotMatch(html, /series=dark-tower[^"<]*creator=/);
  assert.match(html, /href="\/archive\?type=book&amp;q=king"/);
  const empty = renderToStaticMarkup(createElement(ArchiveSelectedCreator, { creator: { id: 1, name: "Кинг", series: [] }, clearHref: "/archive" }));
  assert.doesNotMatch(empty, /Связанные серии/);
  assert.doesNotMatch(empty, /href="\/admin\/creators\//);
  const adminBanner = renderToStaticMarkup(createElement(ArchiveSelectedCreator, { creator: { id: 8, name: "Кинг", series: [] }, clearHref: "/archive", adminCanEdit: true }));
  assert.match(adminBanner, /href="\/admin\/creators\/8\/edit"/);
  assert.match(adminBanner, /aria-label="Редактировать создателя Кинг"/);

  assert.doesNotMatch(empty, /псевдоним для/);
  assert.doesNotMatch(empty, /псевдонимы:/);
  const realAuthor = renderToStaticMarkup(createElement(ArchiveSelectedCreator, { creator: {
    id: 1, name: "Даниель Абрахам", series: [], pseudonyms: [
      { id: 3, name: "Джеймс Кори", slug: "james-corey" },
      { id: 4, name: "Другой псевдоним", slug: "other pen-name" },
    ],
  }, clearHref: "/archive" }));
  assert.match(realAuthor, /Создатель: Даниель Абрахам/);
  assert.match(realAuthor, /Создатель: Даниель Абрахам<span class="font-normal"> \(псевдонимы:/);
  assert.match(realAuthor, /href="\/archive\?creator=james-corey"[^>]*>Джеймс Кори<\/a>, <a/);
  assert.match(realAuthor, /href="\/archive\?creator=other%20pen-name"/);
  const pseudonym = renderToStaticMarkup(createElement(ArchiveSelectedCreator, { creator: {
    id: 1, name: "Джеймс Кори", series: [], pseudonymAuthors: [
      { id: 1, name: "Даниель Абрахам", slug: "daniel-abraham" },
      { id: 2, name: "Тай Френк", slug: "ty-franck" },
    ],
  }, clearHref: "/archive" }));
  assert.match(pseudonym, /Создатель: Джеймс Кори<span class="font-normal"> \(псевдоним для:/);
  assert.match(pseudonym, /href="\/archive\?creator=daniel-abraham"[^>]*>Даниель Абрахам<\/a>, <a/);
  assert.match(pseudonym, /href="\/archive\?creator=ty-franck"[^>]*>Тай Френк<\/a>\)/);
});

test("book summaries and facts use accepted creator links without raw metadata fallback", () => {
  const writerCreators = [{ id: 1, name: "Принятый писатель", slug: "accepted" }];
  const item = { mediaType: "book", mediaTypeLabel: "Книга", releaseYear: 2000, metadataFacts: { authors: ["RAW AUTHOR"] } };
  assert.equal(formatMediaItemSummary(item), "Книга · 2000");
  assert.equal(formatMediaItemSummary({ ...item, writerCreators }), "Книга · 2000 · Принятый писатель");
  const metadata = { facts: item.metadataFacts, writerCreators, sourceProvider: null, sourceExternalId: null, sourceUrl: null };
  const html = renderToStaticMarkup(createElement(MediaMetadataFacts, { metadata }));
  assert.doesNotMatch(html, /RAW AUTHOR/);
  assert.match(html, /Принятый писатель/);
  assert.match(html, /href="\/archive\?creator=accepted"/);
  assert.equal(renderToStaticMarkup(createElement(MediaMetadataFacts, { metadata: { ...metadata, writerCreators: [] } })), "");
});


test("FantLab IDs preserve distinct same-name authors and reject malformed structured metadata", () => {
  assert.equal(extractFantlabCreatorReferences({ authors: ["Legacy"] }), null);
  assert.deepEqual(extractFantlabCreatorReferences({ fantlabAuthors: [{ id: "1", name: "  Ёж Иван " }, { id: "2", name: "Ёж Иван" }, { id: "1", name: "Alias" }] }), [
    { id: "1", name: "Ёж Иван", normalizedName: "еж иван" }, { id: "2", name: "Ёж Иван", normalizedName: "еж иван" },
  ]);
  for (const fantlabAuthors of [null, {}, [{ id: "0", name: "Invalid" }], [{ id: "1", name: " " }], [{ id: 1, name: "Invalid" }]]) assert.throws(() => extractFantlabCreatorReferences({ fantlabAuthors }));
  const html = renderToStaticMarkup(createElement(MediaMetadataFacts, { metadata: { facts: { fantlabAuthors: [{ id: "100", name: "Secret" }] }, sourceProvider: "fantlab", sourceExternalId: "42", sourceUrl: null } }));
  assert.doesNotMatch(html, /fantlabAuthors|Secret/);
});
