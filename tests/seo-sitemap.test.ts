import assert from "node:assert/strict";
import { test } from "node:test";
import { XMLValidator } from "fast-xml-parser";
import { escapeSitemapXml, isSitemapCategory, parseSitemapPage, renderSitemap, renderSitemapIndex, sitemapEntryPath, sitemapRange, STATIC_SITEMAP_PATHS } from "../src/lib/seo/sitemap";

test("sitemap pages are canonical bounded PostgreSQL integer ID ranges", () => {
  assert.deepEqual(sitemapRange(0), { first: 1, last: 10000 });
  assert.deepEqual(sitemapRange(1), { first: 10001, last: 20000 });
  assert.deepEqual(sitemapRange(214748), { first: 2147480001, last: 2147483647 });
  assert.equal(parseSitemapPage("214748.xml"), 214748);
  for (const value of ["-1.xml", "01.xml", "1", "1.0.xml", "214749.xml", "9007199254740992.xml"]) assert.equal(parseSitemapPage(value), null);
  assert.throws(() => sitemapRange(-1));
  assert.equal(isSitemapCategory("profiles"), false);
});

test("entity URLs encode keys and contain only their canonical filter", () => {
  assert.equal(sitemapEntryPath("series", "A&B /"), "/archive?series=A%26B%20%2F");
  assert.equal(sitemapEntryPath("genres", "action"), "/archive?genre=action");
  assert.equal(sitemapEntryPath("platforms", "pc"), "/archive?platform=pc");
  assert.equal(sitemapEntryPath("creators", "writer"), "/archive?creator=writer");
  assert.equal(sitemapEntryPath("media", "a/b"), "/media/a%2Fb");
  assert.equal(sitemapEntryPath("reviews", "42"), "/reviews/42");
  assert.equal(sitemapEntryPath("collections", "all"), "/collections/all");
});

test("XML escapes every reserved character, emits absolute URLs and only real dates", () => {
  assert.equal(escapeSitemapXml(`<>&"'`), "&lt;&gt;&amp;&quot;&apos;");
  const xml = renderSitemap(new URL("https://example.org"), [
    { url: "/archive?series=a&genre=b", updatedAt: "2025-01-02T03:04:05Z" },
    { url: "/media/a", updatedAt: "invalid" }, { url: "/about" },
  ]);
  assert.equal(XMLValidator.validate(xml), true);
  assert.match(xml, /https:\/\/example.org\/archive\?series=a&amp;genre=b/);
  assert.equal(xml.match(/<lastmod>/g)?.length, 1);
  assert.match(xml, /2025-01-02T03:04:05.000Z/);
  assert.equal(XMLValidator.validate(renderSitemapIndex(new URL("https://example.org"), ["/sitemaps/media/0.xml"])), true);
  assert.ok(!STATIC_SITEMAP_PATHS.some((path) => /feed|profile|quiz|tier/.test(path)));
});
