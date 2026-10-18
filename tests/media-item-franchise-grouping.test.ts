import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaItemFranchiseLinks } from "../src/components/archive/media-item-franchise-links";
import type { MediaItemFranchiseLink } from "../src/db/queries/media-items";

const parent = { id: 1, code: "weird", title: "Чертовщина" };
const necromancers = { id: 2, code: "necromancers", title: "Некроманты" };
const demons = { id: 3, code: "demons", title: "Демоны" };
const link = (path: typeof parent[], publicationStatus: MediaItemFranchiseLink["publicationStatus"] = "published"): MediaItemFranchiseLink => ({
  ...path[path.length - 1], path, originalTitle: null, publicationStatus,
});
const render = (franchises: MediaItemFranchiseLink[]) => renderToStaticMarkup(createElement(MediaItemFranchiseLinks, {
  franchises, className: "chip", containerClassName: "paths", trailingAction: createElement("button", null, "+"),
}));
const occurrences = (html: string, code: string) => (html.match(new RegExp(`href="/archive\\?series=${code}"`, "g")) ?? []).length;

test("series siblings share a single linked parent and keep the trailing action", () => {
  const html = render([link([parent, necromancers]), link([parent, demons])]);
  for (const code of ["weird", "necromancers", "demons"]) assert.equal(occurrences(html, code), 1);
  assert.match(html, /•/);
  assert.match(html, /<button>\+<\/button>/);
});

test("nested series share prefixes while distinct identities stay separate", () => {
  const other = { id: 4, code: "other", title: parent.title };
  const html = render([link([parent]), link([parent, necromancers, demons]), link([parent, necromancers]), link([other])]);
  for (const code of ["weird", "necromancers", "demons", "other"]) assert.equal(occurrences(html, code), 1);
});

test("pending paths remain unlinked and do not enter published groups", () => {
  const html = render([link([parent, necromancers]), link([parent, demons], "submitted")]);
  assert.equal(occurrences(html, "demons"), 0);
  assert.equal(occurrences(html, "weird"), 1);
  assert.match(html, /Демоны/);
  assert.match(html, /на проверке/);
});
