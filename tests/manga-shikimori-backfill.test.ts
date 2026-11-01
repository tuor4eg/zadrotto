import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideMangaShikimoriFields, mangaUpdatesLinkIdentity, mangaUpdatesRedirectTarget, matchesMangaUpdates, parseShikimoriBackfillPayload, shikimoriRetryAfterSeconds } from "@/lib/media/manga-shikimori-model";

describe("MangaUpdates evidence for Shikimori manga", () => {
  it("accepts official HTTP and streamed redirects, rejecting unrelated HTML and hosts", () => {
    const legacyUrl = "https://www.mangaupdates.com/series.html?id=4565";
    const canonicalUrl = "https://www.mangaupdates.com/series/mpruuyl/kaze-no-tani-no-nausicaae";
    assert.deepEqual(mangaUpdatesRedirectTarget({ legacyUrl, location: canonicalUrl }), { legacyUrl, canonicalUrl });
    assert.deepEqual(mangaUpdatesRedirectTarget({ legacyUrl, html: `self.__next_f.push([1,"8:E{\\"digest\\":\\"NEXT_REDIRECT;replace;${canonicalUrl};308;\\"}"])` }), { legacyUrl, canonicalUrl });
    assert.equal(mangaUpdatesRedirectTarget({ legacyUrl, location: "https://evil.test/series/mpruuyl" }), null);
    assert.equal(mangaUpdatesRedirectTarget({ legacyUrl, html: `<a href="${canonicalUrl}">Related manga</a>` }), null);
    assert.equal(mangaUpdatesRedirectTarget({ legacyUrl: canonicalUrl, location: canonicalUrl }), null);
  });
  it("does not equate numeric URL IDs with new URL tokens", () => {
    assert.equal(mangaUpdatesLinkIdentity("https://www.mangaupdates.com/series.html?id=123"), "legacy:123");
    assert.equal(mangaUpdatesLinkIdentity("https://www.mangaupdates.com/series/123/name"), "token:123");
    assert.equal(matchesMangaUpdates({ id: "1", externalLinks: [{ url: "https://www.mangaupdates.com/series.html?id=123" }] }, ["https://www.mangaupdates.com/series/3f/name"]), false);
    assert.equal(matchesMangaUpdates({ id: "1", externalLinks: [{ url: "https://www.mangaupdates.com/series.html?id=123" }] }, ["https://www.mangaupdates.com/series/123/name"]), false);
  });
  it("requires an exact official provider identity, not a title or a foreign host", () => {
    const manga = { id: "1", externalLinks: [{ url: "https://www.mangaupdates.com/series/AbC/other-slug" }] };
    assert.equal(matchesMangaUpdates(manga, ["https://mangaupdates.com/series/abc/name"]), true);
    assert.equal(matchesMangaUpdates(manga, ["https://mangaupdates.com.evil.test/series/abc/name"]), false);
    assert.equal(matchesMangaUpdates({ id: "1", russian: "Такое же название" }, ["https://mangaupdates.com/series/abc/name"]), false);
  });
});
describe("conservative manga enrichment", () => {
  const item = { aliases: ["Manual"], description: null, title: "Manga", originalTitle: "Original", maxTitleAliases: 2, manga: { id: "1", russian: "Русское название", description: "[character=1]Герой[/character] спасает мир." } };
  it("adds Russian only as alias and cleans an empty description", () => {
    const result = decideMangaShikimoriFields(item);
    assert.deepEqual(result.aliases, ["Manual", "Русское название"]);
    assert.equal(result.description, "Герой спасает мир.");
    assert.deepEqual(decideMangaShikimoriFields({ ...item, ...result }), result);
  });
  it("replaces the last alias at the limit and preserves Russian or uncertain descriptions", () => {
    for (const description of ["Ручное описание", "Mixed English and русский", "Short text"]) {
      const result = decideMangaShikimoriFields({ ...item, aliases: ["Manual", "Other"], description });
      assert.deepEqual(result.aliases, ["Manual", "Русское название"]);
      assert.equal(result.description, description);
    }
  });
  it("refreshes English descriptions and Shikimori markup using the anime policy", () => {
    for (const description of ["An existing English description from MangaUpdates.", "[manga=1]Ручное описание[/manga]"]) {
      assert.equal(decideMangaShikimoriFields({ ...item, description }).description, "Герой спасает мир.");
    }
    const description = "An existing English description from MangaUpdates.";
    for (const manga of [null, { ...item.manga, description: null }, { ...item.manga, description: "English description" }]) {
      assert.equal(decideMangaShikimoriFields({ ...item, description, manga }).description, description);
    }
  });
  it("replaces only the last alias above the limit and does not evict aliases for duplicates", () => {
    assert.deepEqual(decideMangaShikimoriFields({ ...item, aliases: ["First", "Second", "Third"] }).aliases, ["First", "Second", "Русское название"]);
    assert.deepEqual(decideMangaShikimoriFields({ ...item, aliases: ["Русское название", "Other"] }).aliases, ["Русское название", "Other"]);
    assert.deepEqual(decideMangaShikimoriFields({ ...item, manga: { ...item.manga, russian: item.title }, aliases: ["First", "Second"] }).aliases, ["First", "Second"]);
    assert.deepEqual(decideMangaShikimoriFields({ ...item, maxTitleAliases: 1 }).aliases, ["Русское название"]);
  });
  it("preserves fields for a match without Russian data and for no match", () => {
    for (const manga of [null, { id: "1", russian: null, description: null }, { id: "1", russian: "English", description: "English description" }]) {
      assert.deepEqual(decideMangaShikimoriFields({ ...item, manga }), { aliases: ["Manual"], description: null });
    }
  });
});
describe("backfill payload compatibility", () => {
  it("defaults empty payload to anime and manga while preserving explicit selections", () => {
    assert.deepEqual(parseShikimoriBackfillPayload({}).mediaTypes, ["anime", "manga"]);
    assert.deepEqual(parseShikimoriBackfillPayload({ mediaTypes: ["anime"] }).mediaTypes, ["anime"]);
    assert.deepEqual(parseShikimoriBackfillPayload({ mediaTypes: ["manga"] }).mediaTypes, ["manga"]);
    assert.deepEqual(parseShikimoriBackfillPayload({ mediaTypes: ["anime", "manga"], batchSize: 25, pauseMs: 0 }).mediaTypes, ["anime", "manga"]);
  });
  it("validates bounds, types and checkpoint counters", () => {
    for (const input of [{ mediaTypes: [] }, { mediaTypes: ["book"] }, { mediaTypes: ["anime", "anime"] }, { batchSize: 101 }, { pauseMs: -1 }, { afterMediaItemId: "1" }, { checkpoint: { counters: { matched: -1 } } }, { unexpected: true }]) assert.throws(() => parseShikimoriBackfillPayload(input));
  });
});

it("Shikimori cooldown honors seconds and HTTP dates with bounded invalid fallback", () => {
  assert.equal(shikimoriRetryAfterSeconds("23"), 23);
  assert.equal(shikimoriRetryAfterSeconds("Wed, 01 Jan 2025 00:01:00 GMT", Date.parse("2025-01-01T00:00:00Z")), 60);
  assert.equal(shikimoriRetryAfterSeconds("99999999"), 86400);
  for (const value of [null, "invalid", "-1", "0"]) assert.equal(shikimoriRetryAfterSeconds(value), null);
});
