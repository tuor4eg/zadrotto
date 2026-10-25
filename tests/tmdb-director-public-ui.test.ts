import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilmDirectorDetailsFacts } from "../src/components/archive/film-director-details-facts";

test("film director links select Films while pending identities remain plain names", () => {
  const html = renderToStaticMarkup(createElement(FilmDirectorDetailsFacts, { directors: [
    { name: "Confirmed", creatorId: 8, slug: "director" },
    { name: "Pending", creatorId: null, slug: null },
    { name: "Pending", creatorId: null, slug: null },
  ] }));
  assert.match(html, /Режиссёры:/);
  assert.match(html, /href="\/archive\?creator=director&amp;type=film"/);
  assert.equal((html.match(/Pending/g) ?? []).length, 2);
  assert.doesNotMatch(html, /creator=Pending/);
});

test("missing and empty director projections have no detail separator", () => {
  assert.equal(renderToStaticMarkup(createElement(FilmDirectorDetailsFacts, {})), "");
  assert.equal(renderToStaticMarkup(createElement(FilmDirectorDetailsFacts, { directors: [] })), "");
});
