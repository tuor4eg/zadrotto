import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getSiteOrigin } from "../src/lib/site-url";

const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
const mediaItemPageSource = readFileSync("src/app/media/[code]/page.tsx", "utf8");
const mediaItemsQuerySource = readFileSync("src/db/queries/media-items.ts", "utf8");

describe("site origin", () => {
  it("keeps an explicit HTTPS origin", () => {
    assert.equal(getSiteOrigin("https://preview.example.com").href, "https://preview.example.com/");
  });

  it("removes paths, queries, and hashes from the configured site URL", () => {
    assert.equal(
      getSiteOrigin("https://preview.example.com/archive/?page=2#items").href,
      "https://preview.example.com/",
    );
  });

  it("rejects missing, malformed, and non-http site URLs", () => {
    assert.throws(() => getSiteOrigin(""), /SITE_URL is required/);
    assert.throws(() => getSiteOrigin("not a URL"), /valid absolute URL/);
    assert.throws(() => getSiteOrigin("javascript:alert(1)"), /http or https/);
  });
});

describe("public media item metadata", () => {
  it("resolves relative cover URLs against the configured metadata base", () => {
    assert.match(layoutSource, /metadataBase: getSiteOrigin\(\)/);
    assert.match(mediaItemsQuerySource, /coverUrl: resolveCoverUrl\(item\.coverUrl\)/);
  });

  it("uses the resolved cover for Open Graph and Twitter previews", () => {
    assert.match(mediaItemPageSource, /const images = item\.coverUrl \? \[item\.coverUrl\] : undefined/);
    assert.match(mediaItemPageSource, /openGraph:\s*{[\s\S]*?images,/);
    assert.match(mediaItemPageSource, /twitter:\s*{[\s\S]*?images,/);
  });

  it("does not expose metadata for unpublished media items", () => {
    const start = mediaItemsQuerySource.indexOf(
      "export async function getPublicMediaItemMetadataByCode",
    );
    const end = mediaItemsQuerySource.indexOf(
      "export async function getMediaItemIdentityForAuthorRating",
    );

    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    assert.match(
      mediaItemsQuerySource.slice(start, end),
      /and\(eq\(mediaItems\.code, code\), publishedMediaItemCondition\)/,
    );
  });
});
