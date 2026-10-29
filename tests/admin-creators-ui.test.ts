import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Module, { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
let CreatorForm: typeof import("../src/app/admin/(protected)/creators/creator-form").CreatorForm;
let CreatorDecisionForm: typeof import("../src/app/admin/(protected)/creator-requests/decision-form").CreatorDecisionForm;
let CreatorProviderVariants: typeof import("../src/app/admin/(protected)/creators/provider-variants").CreatorProviderVariants;
const require = createRequire(import.meta.url);
const actionsPath = require.resolve("../src/app/admin/(protected)/creators/actions");
const previousActions = require.cache[actionsPath];

before(async () => {
  // Next replaces server actions with references at the client boundary. Static rendering
  // tests reproduce that boundary without evaluating database/authentication modules.
  const actions = new Module(actionsPath);
  actions.filename = actionsPath;
  actions.loaded = true;
  const unexpectedAction = () => assert.fail("Static rendering must not execute a server action");
  actions.exports = {
    saveCreatorAction: unexpectedAction,
    findCreatorRelatedSeriesAction: unexpectedAction,
    resolveCreatorAction: unexpectedAction,
    reopenCreatorAction: unexpectedAction,
  };
  require.cache[actionsPath] = actions;
  ({ CreatorForm } = await import("../src/app/admin/(protected)/creators/creator-form"));
  ({ CreatorDecisionForm } = await import("../src/app/admin/(protected)/creator-requests/decision-form"));
  ({ CreatorProviderVariants } = await import("../src/app/admin/(protected)/creators/provider-variants"));
});
after(() => {
  if (previousActions) require.cache[actionsPath] = previousActions;
  else delete require.cache[actionsPath];
});

const types = [{ id: 1, name: "Человек", code: "person" }];

test("creator edit form preserves original name and submits selected series as tags", () => {
  const html = renderToStaticMarkup(createElement(CreatorForm, {
    creator: { id: 1, name: "Кинг", originalName: "Stephen King", slug: "king", typeId: 1, seriesIds: [2], relations: [{ targetCreatorId: 2, relationType: "pseudonym_of" }], incomingRelations: [{ sourceCreatorId: 3, name: "Коллектив", relationType: "pseudonym_of" }] },
    creators: [{ id: 1, name: "Кинг" }, { id: 2, name: "Связанный автор" }], types, series: [{ id: 2, title: "Тёмная башня", originalTitle: null }, { id: 3, title: "Оно", originalTitle: null }],
  }));
  assert.match(html, /<h2 id="creator-relations-heading"[^>]*>Псевдоним<\/h2>/);
  assert.match(html, /name="relationType"/);
  assert.match(html, /type="hidden" name="relatedCreatorIds" value="2"/);
  assert.match(html, /href="\/admin\/creators\/3\/edit"[^>]*>Коллектив/);
  assert.match(html, /name="originalName"[^>]*value="Stephen King"/);
  assert.match(html, /type="hidden" name="seriesIds" value="2"/);
  assert.doesNotMatch(html, /type="hidden" name="seriesIds" value="3"/);
  assert.match(html, /aria-label="Убрать серию Тёмная башня"|aria-label="Удалить серию Тёмная башня"/);
  assert.match(html, /type="submit"[^>]*>Сохранить изменения/);
  assert.match(html, /type="button"[^>]*>Найти связанные серии/);
});

test("new creator form does not offer finding series before the creator exists", () => {
  const html = renderToStaticMarkup(createElement(CreatorForm, { types, series: [], creators: [] }));
  assert.doesNotMatch(html, /Найти связанные серии/);
});

test("creator approval requires a selected creator before submitting a mapping", () => {
  const html = renderToStaticMarkup(createElement(CreatorDecisionForm, { requestId: 2, name: "King", people: [{ id: 1, name: "Кинг" }] }));
  assert.match(html, /name="requestId" value="2"/);
  assert.match(html, /name="decision"[^>]*value="map"/);
  assert.match(html, /type="submit"[^>]*disabled=""[^>]*>Применить решение/);
  assert.match(html, /Найти создателя/);
});

test("creator approval shows twelve choices per page with the genre-style navigation", () => {
  const people = Array.from({ length: 13 }, (_, index) => ({ id: index + 1, name: `Создатель ${index + 1}` }));
  const html = renderToStaticMarkup(createElement(CreatorDecisionForm, { requestId: 2, name: "Provider", people }));
  assert.equal((html.match(/name="creator-choice"/g) ?? []).length, 12);
  assert.match(html, /Найдено: 13/);
  assert.match(html, /aria-label="Страницы выбора создателей"/);
  assert.match(html, /1 \/ 2/);
  assert.match(html, /sm:grid-cols-2/);
  assert.doesNotMatch(html, /value="13"/);
});

test("BGG identity bindings display external ID and reopen the whole identity", () => {
  const html = renderToStaticMarkup(createElement(CreatorProviderVariants, {
    variants: [], bindings: [{ id: 17, provider: "bgg", externalCreatorId: "42", externalCreatorName: "Studio" }],
  }));
  assert.match(html, /ID 42/);
  assert.match(html, /Studio/);
  assert.match(html, /name="bindingId" value="17"/);
  assert.doesNotMatch(html, /name="mappingId"/);
  assert.match(html, /boardgamegeek\.com\/boardgamedesigner\/42/);
  const approval = renderToStaticMarkup(createElement(CreatorDecisionForm, { requestId: 1, name: "Studio", provider: "bgg", people: [{ id: 10, name: "Коллектив" }] }));
  assert.match(approval, /Коллектив/);
});

test("supported active creator bindings can be reopened while historical bindings cannot", () => {
  for (const provider of ["bgg", "igdb", "rawg", "tmdb", "fantlab", "anilist"]) {
    const binding = { id: 17, provider, externalCreatorId: "42", externalCreatorName: "Creator" };
    const active = renderToStaticMarkup(createElement(CreatorProviderVariants, { variants: [], bindings: [{ ...binding, active: true }] }));
    assert.match(active, /name="bindingId" value="17"/, provider);
    assert.match(active, /Вернуть в заявки/, provider);
    const historical = renderToStaticMarkup(createElement(CreatorProviderVariants, { variants: [], bindings: [{ ...binding, active: false }] }));
    assert.match(historical, /Историческая \(неактивна\)/, provider);
    assert.doesNotMatch(historical, /name="bindingId"|Вернуть в заявки/, provider);
  }
});

test("FantLab ID binding and name mapping are labelled as separate provenance of one Creator", () => {
  const html = renderToStaticMarkup(createElement(CreatorProviderVariants, {
    variants: [{ id: 8, provider: "fantlab", externalCreatorName: "Кен Кизи" }],
    bindings: [{ id: 7, provider: "fantlab", externalCreatorId: "10433", externalCreatorName: "Кен Кизи" }],
  }));
  assert.match(html, /ID 10433/);
  assert.match(html, /Привязка по ID/);
  assert.match(html, /Соответствие имени/);
  assert.match(html, /https:\/\/fantlab\.ru\/autor10433/);
  assert.match(html, /name="mappingId" value="8"/);
});

test("organization approval shows existing provider identities without merging candidates", () => {
  const html = renderToStaticMarkup(createElement(CreatorDecisionForm, {
    requestId: 9, name: "Studio", provider: "rawg", people: [
      { id: 10, name: "Studio", bindings: [{ provider: "igdb", externalCreatorId: "company:70" }] },
      { id: 11, name: "Studio", bindings: [{ provider: "rawg", externalCreatorId: "publisher:7" }] },
    ],
  }));
  assert.match(html, /igdb · company:70/);
  assert.match(html, /rawg · publisher:7/);
  assert.equal((html.match(/name="creator-choice"/g) ?? []).length, 2);
});

test("game company bindings expose reopening for the exact namespaced identity", () => {
  for (const [provider, externalCreatorId] of [["igdb", "company:70"], ["rawg", "developer:7"], ["rawg", "publisher:7"]]) {
    const html = renderToStaticMarkup(createElement(CreatorProviderVariants, {
      variants: [], bindings: [{ id: 91, provider, externalCreatorId, externalCreatorName: "Studio" }],
    }));
    assert.match(html, /name="bindingId" value="91"/);
    assert.ok(html.includes(externalCreatorId));
    assert.match(html, /Вернуть в заявки/);
  }
});

test("Russian name editor shows provenance and preserves untouched automatic names", () => {
  const html = renderToStaticMarkup(createElement(CreatorForm, {
    creator: { id: 1, name: "Stephen King", nameRu: "Стивен Кинг", nameRuSource: "ai", nameRuProcessed: true, slug: "king", typeId: 1, seriesIds: [], relations: [], incomingRelations: [] },
    creators: [], types, series: [],
  }));
  assert.match(html, /id="creator-name"[^>]*name="name"[^>]*value="Stephen King"/);
  assert.match(html, /id="creator-name-ru"[^>]*value="Стивен Кинг"/);
  assert.match(html, /Источник: ИИ/);
  assert.match(html, /Локализация: обработано/);
  assert.doesNotMatch(html, /name="nameRu"/);
});

test("creator approval shows provider identities and name-only mappings for people", () => {
  const html = renderToStaticMarkup(createElement(CreatorDecisionForm, {
    requestId: 10, name: "Henry Gilroy", provider: "anilist", people: [
      { id: 1, name: "Henry Gilroy", bindings: [{ provider: "tmdb", externalCreatorId: "person:123" }, { provider: "fantlab", externalCreatorId: "42" }, { provider: "bgg", externalCreatorId: null, externalCreatorName: "H. Gilroy" }] },
    ],
  }));
  assert.match(html, /tmdb · person:123/);
  assert.match(html, /fantlab · 42/);
  assert.match(html, /bgg · имя: H\. Gilroy/);
});

test("creator selection searches displayed, source and original names with shared normalization", async () => {
  const { matchesCreatorOptionName } = await import("../src/lib/creators/creator-option-search");
  const { normalizeSearchText } = await import("../src/lib/search/normalize");
  const creator = { name: "Генри Гилрой", sourceName: "Henry Gilroy", originalName: "Ёж Гилрой" };
  for (const query of ["ГЕНРИ", "henry", "ЕЖ", "gilroy"]) assert.equal(matchesCreatorOptionName(creator, normalizeSearchText(query)), true);
  assert.equal(matchesCreatorOptionName(creator, normalizeSearchText("not found")), false);
  assert.equal(matchesCreatorOptionName({ name: "Генри", sourceName: null, originalName: null }, ""), true);
});

test("creator selection links to the admin editor without wrapping the radio button", () => {
  const html = renderToStaticMarkup(createElement(CreatorDecisionForm, { requestId: 1, name: "External", people: [{ id: 42, name: "Dave Stewart" }] }));
  assert.match(html, /href="\/admin\/creators\/42\/edit"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /Выбрать создателя Dave Stewart/);
  assert.match(html, /name="creator-choice"[^>]*value="42"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
