import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MosaicCanvas } from "../src/components/quizzes/mosaic-canvas";

test("widget mosaic has 24 decorative cells and no buttons or loading prompt before participation", () => {
  const markup = renderToStaticMarkup(createElement(MosaicCanvas, { readOnly: true, imageUrl: null, seed: 0, openedMask: 0 }));
  assert.equal((markup.match(/<span\b/g) ?? []).length, 24);
  assert.match(markup, /role="img"/);
  assert.doesNotMatch(markup, /<button\b|Загружаем постер|открыть за 1 очко/);
});

test("game mosaic retains 24 cell buttons", () => {
  const markup = renderToStaticMarkup(createElement(MosaicCanvas, { imageUrl: "/api/quizzes/1/image", seed: 42, openedMask: 1, onOpen: () => {} }));
  assert.equal((markup.match(/<button\b/g) ?? []).length, 24);
  assert.match(markup, /Фрагмент 1: открыт/);
});
