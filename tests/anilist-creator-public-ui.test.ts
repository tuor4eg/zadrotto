import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimeCreatorDetailsFacts } from "../src/components/archive/anime-creator-details-facts";

const confirmed = { name: "Director", creatorId: 4, slug: "director" };
const pending = { name: "Pending studio", creatorId: null, slug: null };

test("anime details group directors, production companies and producers with anime-filtered links", () => {
  const html = renderToStaticMarkup(createElement(AnimeCreatorDetailsFacts, {
    creators: { directors: [confirmed], productionCompanies: [pending], producers: [{ ...confirmed, name: "Producer", slug: "producer" }] },
    facts: { studios: ["Legacy"], anilistCreatorsComplete: true },
  }));
  assert.match(html, /Режиссёры:/);
  assert.match(html, /Производственные компании:/);
  assert.match(html, /Продюсеры:/);
  assert.match(html, /href="\/archive\?creator=director&amp;type=anime"/);
  assert.match(html, /href="\/archive\?creator=producer&amp;type=anime"/);
  assert.match(html, /Pending studio/);
  assert.doesNotMatch(html, /creator=Pending|Legacy|Вещатели/);
});

test("legacy studios survive until complete roster; complete empty groups stay hidden", () => {
  const props = { creators: { directors: [], productionCompanies: [], producers: [] }, facts: { studios: ["Legacy"] } };
  assert.match(renderToStaticMarkup(createElement(AnimeCreatorDetailsFacts, props)), /Legacy/);
  assert.equal(renderToStaticMarkup(createElement(AnimeCreatorDetailsFacts, {
    ...props, facts: { ...props.facts, anilistCreatorsComplete: true },
  })), "");
  assert.equal(renderToStaticMarkup(createElement(AnimeCreatorDetailsFacts, {})), "");
});
