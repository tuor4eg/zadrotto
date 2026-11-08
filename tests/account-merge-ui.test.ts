import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrimaryAccountSelector, MergeForm } from "../src/app/author/(protected)/profile/merge/merge-form";

test("choosing the primary account refreshes the grant preview with GET and offers a no-JS submit", () => {
  const html = renderToStaticMarkup(PrimaryAccountSelector({ grantId: "grant-proof", children: createElement("input", {type:"radio",name:"primary",value:42}) }));
  assert.match(html, /action="\/author\/profile\/merge" method="get"/);
  assert.match(html, /name="grant" value="grant-proof"/);
  assert.match(html, /name="primary" value="42"/);
  assert.match(html, /<noscript>.*Обновить предпросмотр.*<\/noscript>/);
});

test("confirmation submits the reviewed grant, primary and version, and offers cancellation", () => {
  const html = renderToStaticMarkup(createElement(MergeForm, {grantId:"grant-proof",primaryAuthorId:42,version:"reviewed-version"}));
  assert.match(html,/name="grant" value="grant-proof"/);
  assert.match(html,/name="primary" value="42"/);
  assert.match(html,/name="version" value="reviewed-version"/);
  assert.match(html,/Подтвердить объединение/);
  assert.match(html,/href="\/author\/profile"[^>]*>Отмена/);
  assert.doesNotMatch(html,/name="(?:authorId|sessionId|token|password)"/);
});
