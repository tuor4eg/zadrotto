import assert from "node:assert/strict";
import { test } from "node:test";

import { buildArchiveLinkMetadata } from "../src/lib/archive/link-metadata";
import { buildArchivePageMetadata, buildListingMetadata, buildPublicPageMetadata, getPaginationRedirect, NO_INDEX_METADATA } from "../src/lib/seo/metadata";
import robots from "../src/app/robots";
import { metadata as authorMetadata } from "../src/app/author/layout";
import { metadata as adminMetadata } from "../src/app/admin/layout";
import { metadata as usersMetadata } from "../src/app/users/layout";
import { metadata as quizzesMetadata } from "../src/app/quizzes/layout";

test("archive indexes its base and each valid standalone entity, preserving previews", () => {
  const base = buildArchivePageMetadata({}, {});
  assert.deepEqual(base.alternates, { canonical: "/archive" });
  assert.equal(base.robots, undefined);
  for (const kind of ["series", "genre", "platform", "creator"] as const) {
    const entity = buildArchiveLinkMetadata({ kind, key: "ключ & key", name: "Имя", imageUrl: "/cover.webp" });
    const result = buildArchivePageMetadata({ [kind]: "ключ & key" }, entity);
    assert.equal(result.robots, undefined);
    assert.deepEqual(result.alternates, entity.alternates);
    assert.equal(result.title, entity.title);
    assert.deepEqual(result.openGraph?.images, ["/cover.webp"]);
    assert.deepEqual(result.twitter?.images, ["/cover.webp"]);
    assert.equal(result.twitter && "card" in result.twitter ? result.twitter.card : undefined, "summary_large_image");
  }
});

test("search, filter combinations, private scopes, sorting and invalid identities cannot be indexed", () => {
  const entity = buildArchiveLinkMetadata({ kind: "genre", key: "fantasy", name: "Фантастика" });
  for (const params of [
    { q: "Dune" }, { q: "" }, { sort: "rating" }, { ratedBy: "1" }, { type: "book" },
    { genre: "fantasy", series: "dune" }, { genre: "fantasy", q: "Dune" },
    { genre: ["fantasy", "drama"] }, { page: ["1", "2"] }, { page: "0" }, { page: "NaN" },
  ]) {
    assert.deepEqual(buildArchivePageMetadata(params, entity).robots, NO_INDEX_METADATA.robots, JSON.stringify(params));
  }
  assert.deepEqual(buildArchivePageMetadata({ genre: "missing" }, {}).robots, NO_INDEX_METADATA.robots);
});

test("clean pagination has its own canonical and title, page one canonicalizes to base", () => {
  const paged = buildListingMetadata("/reviews", "Рецензии", "Описание", { page: "2" });
  assert.equal(paged.alternates?.canonical, "/reviews?page=2");
  assert.equal(paged.openGraph?.url, "/reviews?page=2");
  assert.equal(paged.title, "Рецензии — страница 2");
  assert.equal(paged.robots, undefined);
  assert.equal(buildListingMetadata("/reviews", "Рецензии", "Описание", { page: "1" }).alternates?.canonical, "/reviews");
  const entity = buildArchiveLinkMetadata({ kind: "series", key: "dune", name: "Дюна" });
  assert.equal(buildArchivePageMetadata({ series: "dune", page: "2" }, entity).alternates?.canonical, "/archive?series=dune&page=2");
  for (const params of [{ q: "text", page: "2" }, { pageSize: "48" }, { view: "mine" }, { page: "01" }, { page: "9007199254740992" }]) {
    const result = buildListingMetadata("/reviews", "Рецензии", "Описание", params);
    assert.deepEqual(result.robots, NO_INDEX_METADATA.robots);
    assert.equal(result.alternates?.canonical, "/reviews");
  }
});

test("detail metadata identifies the canonical card and preserves its cover in both previews", () => {
  const metadata = buildPublicPageMetadata("/media/dune", "Дюна", "Описание", "https://example.org/dune.webp");
  assert.equal(metadata.alternates?.canonical, "/media/dune");
  assert.equal(metadata.openGraph?.url, "/media/dune");
  assert.deepEqual(metadata.openGraph?.images, ["https://example.org/dune.webp"]);
  assert.deepEqual(metadata.twitter?.images, ["https://example.org/dune.webp"]);
  assert.equal(buildPublicPageMetadata("/help", "Помощь", "Описание").alternates?.canonical, "/help");
});

test("clamped or malformed pages redirect to the resolved page while retaining all filters", () => {
  assert.equal(getPaginationRedirect("/archive", { page: "999999" }, 42), "/archive?page=42");
  assert.equal(getPaginationRedirect("/series", { page: "999999", q: "Дюна & мир" }, 1), "/series?q=%D0%94%D1%8E%D0%BD%D0%B0+%26+%D0%BC%D0%B8%D1%80");
  assert.equal(getPaginationRedirect("/archive", { page: "0", series: "dune" }, 1), "/archive?series=dune");
  assert.equal(getPaginationRedirect("/creators", { page: ["2", "3"], role: ["writer", "director"] }, 2), "/creators?role=writer&role=director&page=2");
  assert.equal(getPaginationRedirect("/archive", { page: "2" }, 2), null);
  assert.equal(getPaginationRedirect("/archive", {}, 1), null);
});

test("excluded route trees expose noindex without blocking link discovery", () => {
  for (const metadata of [authorMetadata, adminMetadata, usersMetadata, quizzesMetadata]) {
    assert.deepEqual(metadata.robots, { index: false, follow: true });
  }
});

test("robots uses SITE_URL and permits reading noindex pages and site assets", () => {
  const previous = process.env.SITE_URL;
  try {
    process.env.SITE_URL = "https://example.org/deploy/path";
    assert.deepEqual(robots(), {
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://example.org/sitemap.xml",
    });
  } finally {
    if (previous === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previous;
  }
});
