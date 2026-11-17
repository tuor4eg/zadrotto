import assert from "node:assert/strict";
import { test } from "node:test";
import { isStaticGenEnabled } from "next/dist/server/route-modules/app-route/helpers/is-static-gen-enabled";

test("Next.js does not prerender sitemap routes or require a database when loading them", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const index = await import("../src/app/sitemap.xml/route");
    const page = await import("../src/app/sitemaps/[category]/[page]/route");
    for (const route of [index, page]) {
      assert.equal(route.dynamic, "force-dynamic");
      assert.equal(isStaticGenEnabled(route), false);
    }
    const invalid = await page.GET(new Request("http://localhost/sitemaps/invalid/0.xml"), {
      params: Promise.resolve({ category: "invalid", page: "0.xml" }),
    });
    assert.equal(invalid.status, 404);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
