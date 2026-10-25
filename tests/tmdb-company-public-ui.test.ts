import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilmCompanyDetailsFacts } from "../src/components/archive/film-company-details-facts";
import { ArchiveSelectedCreator } from "../src/app/archive/archive-creator-context";
import { buildCreatorArchiveHref } from "../src/lib/media/creator-role-filter";
import { parseMediaTypeFilter } from "../src/app/media-items-catalog-logic";

test("Creator type links preserve roles and search while resetting pagination", () => {
  const input = { creatorSlug: "studio", roleCode: "production_company", searchParams: "q=space&type=game&page=4&creatorRole=publisher&year=2000" };
  const film = new URL(buildCreatorArchiveHref({ ...input, mediaType: "film" }), "https://example.test");
  assert.equal(film.searchParams.get("type"), "film");
  assert.equal(film.searchParams.get("creatorRole"), "production_company");
  assert.equal(film.searchParams.get("q"), "space");
  assert.equal(film.searchParams.get("year"), "2000");
  assert.equal(film.searchParams.has("page"), false);
  const all = new URL(buildCreatorArchiveHref({ ...input, mediaType: "all" }), "https://example.test");
  assert.equal(all.searchParams.has("type"), false);
  assert.equal(parseMediaTypeFilter(null, [{ code: "film", name: "Фильмы", description: null }]), "all");
  assert.equal(parseMediaTypeFilter("anime", [{ code: "film", name: "Фильмы", description: null }]), "all");
});

test("Creator context retains roles without duplicating the main media type tabs", () => {
  for (const name of ["Автор", "Студия", "Коллектив"]) {
    const html = renderToStaticMarkup(createElement(ArchiveSelectedCreator, {
      creator: { id: 1, name, series: [], roles: [{ code: "writer", name: "Писатель" }, { code: "director", name: "Режиссёр" }] },
      clearHref: "/archive", selectedRole: "director", allRolesHref: "/archive?creator=creator",
      roleHrefs: { writer: "/archive?creator=creator&creatorRole=writer", director: "/archive?creator=creator&creatorRole=director" },
    }));
    assert.match(html, /Роли создателя/);
    assert.match(html, /aria-current="page"/);
    assert.match(html, /creatorRole=writer/);
    assert.doesNotMatch(html, /Произведения создателя по типам|>Фильмы<|>Книги</);
  }
});

test("film companies link working Creators into Films and retain pending names", () => {
  const html = renderToStaticMarkup(createElement(FilmCompanyDetailsFacts, {
    companies: [{ name: "Studio", creatorId: 7, slug: "studio" }, { name: "Pending", creatorId: null, slug: null }],
    facts: { productionCompanies: ["Legacy"] },
  }));
  assert.match(html, /href="\/archive\?creator=studio&amp;type=film"/);
  assert.match(html, /Pending/);
  assert.doesNotMatch(html, /Legacy|creator=Pending/);
  assert.equal(renderToStaticMarkup(createElement(FilmCompanyDetailsFacts, {
    companies: [], facts: { productionCompanies: ["Legacy"] },
  })), "");
  assert.match(renderToStaticMarkup(createElement(FilmCompanyDetailsFacts, {
    facts: { productionCompanies: ["Legacy"] },
  })), /Legacy/);
});
