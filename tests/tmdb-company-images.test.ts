import assert from "node:assert/strict";
import { test } from "node:test";

test("TMDB logos validate paths and object keys", { skip: !process.env.NODE_PATH }, async () => {
  const { getTmdbCompanyLogoUrl } = await import("../src/lib/creators/tmdb-company-images");
  const { getExternalCompanyImageUrl } = await import("../src/lib/creators/game-company-images");
  assert.equal(getTmdbCompanyLogoUrl("/A_1-2.png"), "https://image.tmdb.org/t/p/original/A_1-2.png");
  for (const path of [null, "", "https://evil.test/a.png", "/../a.png", "/a.svg", "/a.png?x=1", "//evil.png"]) assert.equal(getTmdbCompanyLogoUrl(path), null);
  const suffix = `tmdb/company-7/${"a".repeat(64)}.webp`;
  assert.equal(getExternalCompanyImageUrl(`avatars/external-companies/${suffix}`), `/company-images/${suffix}`);
  assert.equal(getExternalCompanyImageUrl(`avatars/external-companies/tmdb/../${"a".repeat(64)}.webp`), null);
});
