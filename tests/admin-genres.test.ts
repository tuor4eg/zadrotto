import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { groupGenreProviderVariants, parseGenreId, parseGenreName } from "../src/lib/media/admin-genres";
import { GenreProviderVariants } from "../src/app/admin/(protected)/genres/provider-variants";

describe("admin genre form validation", () => {
  it("accepts serial IDs and rejects malformed or out-of-range IDs", () => {
    assert.equal(parseGenreId("53"), 53);
    for (const value of [null, {}, "", "0", "-1", "1.5", "1e2", "2147483648", "9007199254740992"]) {
      assert.equal(parseGenreId(value), null);
    }
  });
  it("trims names without changing their case or rejecting an existing name", () => {
    assert.equal(parseGenreName("  Action  "), "Action");
    assert.equal(parseGenreName("Драма"), "Драма");
    for (const value of [null, {}, "", " \t\n"]) assert.equal(parseGenreName(value), null);
  });
});

describe("provider variants", () => {
  it("groups by provider/type, deduplicates names, and preserves provider spelling", () => {
    const variant = { genreId: 1, provider: "tmdb", mediaType: "series", mediaTypeName: "Сериал", externalGenreName: "Боевик и Приключения" };
    const groups = groupGenreProviderVariants([
      variant, variant,
      { ...variant, mediaType: "film", mediaTypeName: "Фильм", externalGenreName: "боевик" },
      { ...variant, provider: "anilist", mediaType: "anime", mediaTypeName: "Аниме", externalGenreName: "Action" },
    ]);
    assert.equal(groups.length, 3);
    assert.deepEqual(groups[2].names, ["Боевик и Приключения"]);
    const html = renderToStaticMarkup(createElement(GenreProviderVariants, { groups }));
    for (const value of ["TMDB", "AniList", "Фильм", "Сериал", "Аниме", "Action", "боевик"]) assert.ok(html.includes(value));
    assert.doesNotMatch(html, /<input|<button|<a /);
  });
  it("renders an explicit empty state", () => {
    assert.match(renderToStaticMarkup(createElement(GenreProviderVariants, { groups: [] })), /Нет соответствий провайдеров/);
  });
});

describe("admin genre routes", () => {
  const action = readFileSync("src/app/admin/(protected)/genres/actions.ts", "utf8");
  it("adds the section to the records menu and uses the same rows for desktop/mobile", () => {
    const menu = readFileSync("src/app/admin/(protected)/admin-nav-menu.tsx", "utf8");
    assert.match(menu, /href: "\/admin\/genres".*label: "Жанры"/);
    const page = readFileSync("src/app/admin/(protected)/genres/page.tsx", "utf8");
    assert.match(page, /md:hidden/);
    assert.match(page, /hidden md:block/);
    assert.equal((page.match(/genres\.map\(/g) ?? []).length, 2);
  });
  it("requires admin access before reading input and invalidates existing genre consumers", () => {
    assert.ok(action.indexOf("await requireAdminUser()") < action.indexOf('formData.get("genreId")'));
    for (const route of ["/admin/genres", "/media/[code]", "/reviews/[id]", "/admin/media/[id]/edit", "/author/media/[id]/edit"]) {
      assert.ok(action.includes(`revalidatePath("${route}"`));
    }
    assert.match(action, /if \(!genre\) redirect\("\/admin\/genres\?error=invalid-genre"\)/);
  });
  it("returns 404 for invalid or absent genres and exposes only the name editor", () => {
    const page = readFileSync("src/app/admin/(protected)/genres/[id]/edit/page.tsx", "utf8");
    assert.match(page, /if \(id === null\) notFound\(\)/);
    assert.match(page, /if \(!genre\) notFound\(\)/);
    const form = readFileSync("src/app/admin/(protected)/genres/genre-form.tsx", "utf8");
    assert.doesNotMatch(form, /genre\.slug|genre-slug/);
    assert.match(form, /Название используется во всех карточках записей с этим жанром/);
    assert.doesNotMatch(form, /name="slug"|name="isActive"/);
  });
});
