import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaItemTagList } from "../src/components/archive/media-item-tags";

const tags = [
  { id: 1, code: "private", title: "Личный", isPublic: false, isMine: true },
  { id: 2, code: "public", title: "Публичный", isPublic: true, isMine: false },
  { id: 3, code: "own-public", title: "Свой публичный", isPublic: true, isMine: true },
  { id: 4, code: "editorial", title: "От редакции", isPublic: true, isMine: true, isEditorial: true },
];
test("public tags precede personal tags; only own non-editorial assignments are removable", () => {
  const html = renderToStaticMarkup(createElement(MediaItemTagList, { tags, canAssign: true, isPending: false, onRemove: () => {} }));
  assert.ok(html.indexOf('tag=public') < html.indexOf('tag=private'));
  assert.ok(html.indexOf('tag=editorial') < html.indexOf('tag=private'));
  assert.match(html, /Удалить своё назначение: Личный/);
  assert.match(html, /Удалить своё назначение: Свой публичный/);
  assert.doesNotMatch(html, /Удалить своё назначение: Публичный|Удалить своё назначение: От редакции/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
});
test("guests and demo without an account cannot remove tags", () => {
  const html = renderToStaticMarkup(createElement(MediaItemTagList, { tags: tags.filter(tag => tag.isPublic), canAssign: false, isPending: false, onRemove: () => {} }));
  assert.doesNotMatch(html, /<button/);
});
