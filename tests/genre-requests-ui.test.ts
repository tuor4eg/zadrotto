import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseGenreRequestDecision } from "../src/lib/media/genre-request-form";
import { GenreRequestsList } from "../src/app/admin/(protected)/genre-requests/request-list";
import { GenreRequestDecisionForm } from "../src/app/admin/(protected)/genre-requests/decision-form";
import { genreRequestError } from "../src/app/admin/(protected)/genre-requests/presentation";
import type { GenreRequestListItem } from "../src/db/queries/genre-requests";

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry);
  return data;
}

describe("genre request decisions", () => {
  it("validates each decision and retains only its relevant fields", () => {
    assert.deepEqual(parseGenreRequestDecision(form({ requestId: "1", decision: "create", name: "  Драма  ", slug: "changed", genreIds: "999" })), { requestId: 1, decision: "create", name: "Драма" });
    assert.deepEqual(parseGenreRequestDecision(form({ requestId: "2", decision: "map", genreIds: ["3", "4", "3"] })), { requestId: 2, decision: "map", genreIds: [3, 4] });
    assert.deepEqual(parseGenreRequestDecision(form({ requestId: "3", decision: "exclude", name: "ignored" })), { requestId: 3, decision: "exclude" });
    for (const values of [
      { requestId: "0", decision: "exclude" }, { requestId: "1e2", decision: "exclude" }, { requestId: "2147483648", decision: "exclude" },
      { requestId: "1", decision: "delete" }, { requestId: "1", decision: "create", name: " \t" },
      { requestId: "1", decision: "map" }, { requestId: "1", decision: "map", genreIds: ["2", "bad"] },
    ]) assert.equal(parseGenreRequestDecision(form(values)), null);
  });
  it("renders multiple choices without a slug field", () => {
    const html = renderToStaticMarkup(createElement(GenreRequestDecisionForm, { requestId: 1,
      genres: [{ id: 10, name: "Драма", slug: "drama" }, { id: 11, name: "Комедия", slug: "comedy" }], action: async () => {} }));
    for (const text of ["Создать наш жанр", "Связать с существующими", "Не считать жанром", "Драма", "Комедия"]) assert.ok(html.includes(text));
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
    assert.doesNotMatch(html, /name="slug"|>drama<|>comedy</);
  });
});

describe("genre request administrative display", () => {
  const request = { id: 1, provider: "tmdb", mediaType: "film", mediaTypeName: "Фильм", externalGenreName: "Новый жанр", normalizedExternalGenreName: "новый жанр",
    occurrenceCount: 3, status: "pending", decision: null, firstSeenAt: new Date("2026-10-05T10:00:00Z"), lastSeenAt: new Date(), resolvedAt: null,
    resolvedByAdminId: null, jobRunId: null, jobError: null } satisfies GenreRequestListItem;
  it("shows the same provider/type, count, genre and status on desktop and mobile", () => {
    const html = renderToStaticMarkup(createElement(GenreRequestsList, { requests: [request] }));
    for (const text of ["Новый жанр", "TMDB", "Фильм", "Ожидает решения"]) assert.equal(html.split(text).length - 1, 2);
    assert.match(html, /md:hidden/);
    assert.match(html, /hidden md:block/);
    assert.equal((html.match(/href="\/admin\/genre-requests\/1"/g) ?? []).length, 2);
  });
  it("shows only pending requests and explains concurrent decisions", () => {
    assert.match(renderToStaticMarkup(createElement(GenreRequestsList, { requests: [] })), /Нет жанров, ожидающих решения/);
    const page = readFileSync("src/app/admin/(protected)/genre-requests/page.tsx", "utf8");
    assert.match(page, /getGenreRequests\(\)/);
    assert.doesNotMatch(page, /Все заявки|all=1|<nav/);
    assert.match(genreRequestError("already-resolved")!, /Другой администратор/);
  });
  it("authenticates both actions before reading input and has guarded detail routes", () => {
    const actions = readFileSync("src/app/admin/(protected)/genre-requests/actions.ts", "utf8");
    for (const section of actions.split("export async function").slice(1)) assert.ok(section.indexOf("requireAdminUser()") < section.indexOf('formData.get("requestId")'));
    const page = readFileSync("src/app/admin/(protected)/genre-requests/[id]/page.tsx", "utf8");
    assert.match(page, /if \(!id\) notFound\(\)/);
    assert.match(page, /if \(!detail\) notFound\(\)/);
    const nav = readFileSync("src/app/admin/(protected)/admin-nav-menu.tsx", "utf8");
    assert.match(nav, /href: "\/admin\/genre-requests".*count: pendingGenreRequestsCount/);
  });
});
