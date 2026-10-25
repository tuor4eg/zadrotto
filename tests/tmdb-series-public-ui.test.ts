import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeriesCreatorDetailsFacts } from "../src/components/archive/series-creator-details-facts";

const person = { name: "Русское Имя", creatorId: 1, slug: "person" };
test("series facts show four roles, repeated participation, series links and pending names", () => {
  const html = renderToStaticMarkup(createElement(SeriesCreatorDetailsFacts, { creators: {
    productionCompanies: [{ name: "Студия", creatorId: 2, slug: "studio" }],
    networks: [{ name: "Вещатель", creatorId: null, slug: null }],
    creators: [person], showrunners: [person],
  } }));
  for (const label of ["Производство", "Вещатели", "Создатели", "Шоураннеры"]) assert.match(html, new RegExp(label));
  assert.equal((html.match(/Русское Имя/g) ?? []).length, 2);
  assert.equal((html.match(/creator=person&amp;type=series/g) ?? []).length, 2);
  assert.match(html, /Вещатель/);
});

test("series legacy facts are fallbacks until an authoritative empty roster exists", () => {
  const facts = { networks: ["Legacy Network"], productionCompanies: ["Legacy Studio"] };
  const legacy = renderToStaticMarkup(createElement(SeriesCreatorDetailsFacts, { facts }));
  assert.match(legacy, /Legacy Network/);
  assert.match(legacy, /Legacy Studio/);
  assert.equal(renderToStaticMarkup(createElement(SeriesCreatorDetailsFacts, {
    facts, creators: { productionCompanies: [], networks: [], creators: [], showrunners: [] },
  })), "");
});
