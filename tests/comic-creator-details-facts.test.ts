import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComicCreatorDetailsFacts } from "../src/components/archive/comic-creator-details-facts";

test("comic creator roles link to the archive with the comic filter", () => {
  const creators = [
    { id: 1, name: "Alan Moore", slug: "alan-moore", roleCode: "screenwriter", roleName: "Сценарист" },
    { id: 2, name: "Dave Gibbons", slug: "dave-gibbons", roleCode: "artist", roleName: "Художник" },
    { id: 3, name: "DC Comics", slug: "dc-comics", roleCode: "publisher", roleName: "Издатель" },
  ];
  const html = renderToStaticMarkup(createElement(ComicCreatorDetailsFacts, { creators, separatorBefore: true }));
  for (const text of ["Сценаристы", "Художники", "Издательство", "Alan Moore", "Dave Gibbons", "DC Comics"]) assert.match(html, new RegExp(text));
  assert.match(html, /creator=alan-moore&amp;type=comic/);
  assert.match(html, /creator=dave-gibbons&amp;type=comic/);
  assert.equal(renderToStaticMarkup(createElement(ComicCreatorDetailsFacts, {})), "");
});

test("comic artists are grouped by their verified work and unclassified artists remain visible", () => {
  const creators = [
    { id: 1, name: "Вася", slug: "vasya", roleCode: "artist", roleName: "Художник" },
    { id: 2, name: "Петя", slug: "petya", roleCode: "artist", roleName: "Художник" },
    { id: 3, name: "Дима", slug: "dima", roleCode: "artist", roleName: "Художник" },
    { id: 4, name: "Лена", slug: "lena", roleCode: "artist", roleName: "Художник" },
  ];
  const artistWork = [{ creatorId: 1, work: ["inker"] }, { creatorId: 2, work: ["inker"] }, { creatorId: 3, work: ["cover", "penciler"] }];
  const html = renderToStaticMarkup(createElement(ComicCreatorDetailsFacts, { creators, artistWork }));
  assert.match(html, /Вася<\/a>, <a[^>]+>Петя<\/a><\/span> \(тушь\)/);
  assert.match(html, /Дима<\/a><\/span> \(карандаш, обложка\)/);
  assert.match(html, /Лена<\/a>/);
  assert.match(html, /creator=petya&amp;type=comic/);
});
