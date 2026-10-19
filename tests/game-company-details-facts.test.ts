import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameCompanyDetailsFacts, type GameCompanyDisplay } from "@/components/archive/game-company-details-facts";
import { MediaMetadataFacts } from "@/components/ui/media-metadata-facts";

const facts = { developers: ["Legacy developer"], publishers: ["Legacy publisher"] };
const company: GameCompanyDisplay = { provider: "igdb", externalId: "company:1", name: "Studio", roleCode: "developer", creatorId: 4, slug: "studio" };

test("game companies deduplicate confirmed organizations per role across providers", () => {
  const html = renderToStaticMarkup(createElement(GameCompanyDetailsFacts, { facts, companies: [company,
    { ...company, provider: "rawg", externalId: "developer:7" }, { ...company, roleCode: "publisher" },
  ] }));
  assert.equal((html.match(/href="\/archive\?creator=studio"/g) ?? []).length, 2);
  assert.match(html, /Разработчики/);
  assert.match(html, /Издатели/);
  assert.doesNotMatch(html, /Legacy/);
});

test("unknown external identities stay separate even with equal names", () => {
  const html = renderToStaticMarkup(createElement(GameCompanyDetailsFacts, { companies: [
    { ...company, creatorId: null, slug: null },
    { ...company, externalId: "company:2", creatorId: null, slug: null },
  ] }));
  assert.equal((html.match(/Studio/g) ?? []).length, 2);
  assert.doesNotMatch(html, /href=/);
});

test("confirmed empty composition suppresses legacy fallback; missing composition retains it", () => {
  assert.equal(renderToStaticMarkup(createElement(GameCompanyDetailsFacts, { facts, companies: [] })), "");
  const legacy = renderToStaticMarkup(createElement(GameCompanyDetailsFacts, { facts }));
  assert.match(legacy, /Legacy developer/);
  assert.match(legacy, /Legacy publisher/);
});

test("technical company references are never rendered by generic facts", () => {
  const html = renderToStaticMarkup(createElement(MediaMetadataFacts, { metadata: {
    facts: { ...facts, gameCompanyReferences: [{ externalId: "company:123", roleCode: "developer", name: "Raw" }] },
    sourceProvider: "igdb", sourceExternalId: "5", sourceUrl: null, gameCompanies: [company],
  } }));
  assert.match(html, /Studio/);
  assert.doesNotMatch(html, /gameCompanyReferences|company:123|Legacy/);
});
