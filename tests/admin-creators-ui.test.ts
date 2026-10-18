import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreatorForm } from "../src/app/admin/(protected)/creators/creator-form";
import { CreatorDecisionForm } from "../src/app/admin/(protected)/creator-requests/decision-form";
import { CreatorProviderVariants } from "../src/app/admin/(protected)/creators/provider-variants";

const types = [{ id: 1, name: "Человек", code: "person" }];

test("creator edit form preserves original name and submits selected series as tags", () => {
  const html = renderToStaticMarkup(createElement(CreatorForm, {
    creator: { id: 1, name: "Кинг", originalName: "Stephen King", slug: "king", typeId: 1, seriesIds: [2], relations: [{ targetCreatorId: 2, relationType: "pseudonym_of" }], incomingRelations: [{ sourceCreatorId: 3, name: "Коллектив", relationType: "pseudonym_of" }] },
    creators: [{ id: 1, name: "Кинг" }, { id: 2, name: "Связанный автор" }], types, series: [{ id: 2, title: "Тёмная башня", originalTitle: null }, { id: 3, title: "Оно", originalTitle: null }],
  }));
  assert.match(html, /Связанные Creator/);
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
