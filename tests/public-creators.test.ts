import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { paginatePublicCreators } from "../src/lib/media/public-creators";
import { CreatorCatalog } from "../src/app/creators/creators-catalog";
import { buildCreatorArchiveHref } from "../src/lib/media/creator-role-filter";
import { ArchiveSelectedCreator } from "../src/app/archive/archive-creator-context";

const rows = ["Достоевский", "Frank Herbert", "Кинг", "12 авторов", "# Псевдоним", "Достоевский"].map((name, index) => ({
  id: index + 1, slug: `creator-${index}`, name, mediaItemsCount: index + 1, nameMatches: true,
}));

test("creator alphabet filters before pagination and keeps distinct namesakes", () => {
  const first = paginatePublicCreators(rows, { page: 1, pageSize: 2, searchQuery: "" });
  assert.deepEqual(first.availableLetters, ["0-9", "Д", "К", "F", "#"]);
  assert.deepEqual(first.items.map(row => row.id), [4, 1]);
  assert.equal(first.totalPages, 3);
  const letter = paginatePublicCreators(rows, { page: 99, pageSize: 24, letter: "Д", searchQuery: "" });
  assert.deepEqual(letter.items.map(row => row.id), [1, 6]);
  assert.equal(letter.page, 1);
  assert.equal(letter.paginationTotalCount, 2);
  assert.equal(paginatePublicCreators(rows, { page: 1, pageSize: 24, letter: "Z", searchQuery: "" }).selectedLetter, undefined);
  const search = paginatePublicCreators(rows.map(row => ({ ...row, nameMatches: row.id === 2 })), {
    page: 1, pageSize: 24, letter: "Д", searchQuery: "herbert",
  });
  assert.equal(search.selectedLetter, undefined);
  assert.deepEqual(search.items.map(row => row.id), [2]);
  assert.equal(paginatePublicCreators([], { page: 3, pageSize: 24, searchQuery: "" }).page, 1);
});

test("creator catalog renders alphabet groups, archive links and record counts", () => {
  const html = renderToStaticMarkup(createElement(CreatorCatalog, { items: rows }));
  assert.match(html, /lg:columns-2/);
  assert.match(html, /href="\/archive\?creator=creator-0"/);
  assert.match(html, /aria-label="1 запись"/);
  assert.match(html, /aria-label="6 записей"/);
  assert.equal((html.match(/>Д<\/h2>/g) ?? []).length, 1);
});

test("creator images survive pagination and use the local route in catalog and selected banner", () => {
  const avatarObjectKey = "avatars/creators/1/00000000-0000-4000-8000-000000000001.webp";
  const creator = { id: 1, slug: "king", name: "Стивен Кинг", mediaItemsCount: 3, avatarObjectKey, nameMatches: true };
  const page = paginatePublicCreators([creator], { page: 1, pageSize: 24, searchQuery: "" });
  assert.equal(page.items[0].avatarObjectKey, avatarObjectKey);
  const catalog = renderToStaticMarkup(createElement(CreatorCatalog, { items: page.items }));
  const banner = renderToStaticMarkup(createElement(ArchiveSelectedCreator, { creator: { ...creator, series: [] }, clearHref: "/archive" }));
  for (const html of [catalog, banner]) {
    assert.match(html, /src="\/creator-avatars\/1\/00000000-0000-4000-8000-000000000001.webp"/);
    assert.doesNotMatch(html, /fantlab\.ru/);
  }
  const fallback = renderToStaticMarkup(createElement(ArchiveSelectedCreator, { creator: { ...creator, avatarObjectKey: null, series: [] }, clearHref: "/archive" }));
  assert.match(fallback, />СК<\/span>/);
  assert.doesNotMatch(fallback, /<img/);
});

test("system roles survive pagination and filter creators before alphabet and pages", () => {
  const roles = [{ code: "custom-role", name: "Новая роль" }, { code: "artist", name: "Художник" }];
  const input = rows.map((row, index) => ({ ...row, roles: index === 1 ? roles : [] }));
  const page = paginatePublicCreators(input, { page: 99, pageSize: 1, searchQuery: "", roles: ["custom-role"] });
  assert.equal(page.paginationTotalCount, 1);
  assert.equal(page.page, 1);
  assert.deepEqual(page.availableLetters, ["F"]);
  assert.deepEqual(page.items[0].roles, roles);
  const html = renderToStaticMarkup(createElement(CreatorCatalog, { items: page.items }));
  assert.match(html, />Новая роль<\/a>/);
  assert.match(html, />Художник<\/a>/);
});

test("selected creator shows every supplied system role with its shared icon", () => {
  const html = renderToStaticMarkup(createElement(ArchiveSelectedCreator, {
    creator: { id: 1, name: "Создатель", series: [], roles: [{ code: "designer", name: "Дизайнер" }, { code: "artist", name: "Художник" }, { code: "custom", name: "Новая роль" }] },
    clearHref: "/archive",
  }));
  assert.match(html, /aria-label="Роли создателя"/);
  for (const name of ["Дизайнер", "Художник", "Новая роль"]) assert.ok(html.includes(name));
  for (const icon of ["lucide-dices", "lucide-palette", "lucide-user-round"]) assert.ok(html.includes(icon));
});


test("creator catalog preserves the selected media type when opening archive", () => {
  const html = renderToStaticMarkup(createElement(CreatorCatalog, { items: rows, mediaType: "boardgame" }));
  assert.match(html, /href="\/archive\?creator=creator-0&amp;type=boardgame"/);
});


test("creator role links open the archive with creator and role, preserving the media type",()=>{
  const creator={...rows[0],roles:[{code:"developer",name:"Разработчик"},{code:"publisher",name:"Издатель"}]};
  const html=renderToStaticMarkup(createElement(CreatorCatalog,{items:[creator],mediaType:"game"}));
  assert.match(html,/href="\/archive\?creator=creator-0&amp;creatorRole=developer&amp;type=game"/);
  assert.match(html,/href="\/archive\?creator=creator-0&amp;creatorRole=publisher&amp;type=game"/);
  assert.match(html,/>Разработчик<\/a>/);
  assert.match(html,/>Издатель<\/a>/);
});

test("role switching preserves archive filters, resets pagination, and all roles removes only the role",()=>{
  const searchParams="creator=old&creatorRole=publisher&page=7&type=game&q=space&series=series-1&genre=strategy&year=2001&sort=title&mine=rated&pageSize=24";
  const href=buildCreatorArchiveHref({creatorSlug:"ic-company",roleCode:"developer",searchParams});
  const params=new URL(href,"https://example.test").searchParams;
  assert.equal(params.get("creator"),"ic-company");assert.equal(params.get("creatorRole"),"developer");
  assert.equal(params.has("page"),false);
  for(const [key,value] of new URLSearchParams(searchParams))if(!["creator","creatorRole","page"].includes(key))assert.equal(params.get(key),value);
  const all=new URL(buildCreatorArchiveHref({creatorSlug:"ic-company",searchParams:params.toString()}),"https://example.test").searchParams;
  assert.equal(all.has("creatorRole"),false);assert.equal(all.get("creator"),"ic-company");assert.equal(all.get("year"),"2001");
});

test("selected creator roles highlight the active role and provide an all-roles link",()=>{
  const creator={id:1,name:"IC Company",series:[],roles:[{code:"publisher",name:"Издатель"},{code:"developer",name:"Разработчик"}]};
  const html=renderToStaticMarkup(createElement(ArchiveSelectedCreator,{creator,clearHref:"/archive",selectedRole:"developer",
    allRolesHref:"/archive?creator=ic-company",roleHrefs:{developer:"/archive?creator=ic-company&creatorRole=developer",publisher:"/archive?creator=ic-company&creatorRole=publisher"}}));
  const selected=html.match(/<a\b[^>]*href="\/archive\?creator=ic-company&amp;creatorRole=developer"[^>]*>/)?.[0];
  assert.ok(selected);assert.match(selected,/aria-current="page"/);
  assert.match(html,/href="\/archive\?creator=ic-company"[^>]*>Все<\/a>/);
  assert.doesNotMatch(html,/creatorRole=publisher"[^>]*aria-current/);
});

test("media chips expand only the selected type and keep role counts and filters in links", async () => {
  const { CreatorMediaTypeChips } = await import("../src/app/creators/creator-media-type-chips");
  const mediaTypes = [
    { code: "comic", name: "Комиксы", creatorsCount: 3, roles: [{ code: "screenwriter", name: "Сценарист", creatorsCount: 2 }, { code: "artist", name: "Художник", creatorsCount: 1 }] },
    { code: "book", name: "Книги", creatorsCount: 1, roles: [{ code: "writer", name: "Писатель", creatorsCount: 1 }] },
  ];
  const html = renderToStaticMarkup(createElement(CreatorMediaTypeChips, { mediaTypes, selectedMediaType: "comic", selectedRoles: ["screenwriter"], searchQuery: "имя", pageSize: 48 }));
  assert.match(html, /Сценарист/);
  assert.match(html, /Художник/);
  assert.doesNotMatch(html, /Писатель/);
  assert.match(html, /type=comic&amp;q=/);
  assert.match(html, /type=comic&amp;role=screenwriter%2Cartist&amp;q=/);
  assert.match(html, /type=book&amp;q=/);
  assert.match(html, /aria-current="true"/);
});

test("role filtering combines with search and pagination", () => {
  const input = [
    { ...rows[0], roles: [{ code: "artist", name: "Художник" }], nameMatches: true },
    { ...rows[1], roles: [{ code: "writer", name: "Писатель" }], nameMatches: true },
    { ...rows[2], roles: [{ code: "artist", name: "Художник" }], nameMatches: false },
  ];
  const page = paginatePublicCreators(input, { page: 9, pageSize: 1, roles: ["artist"], searchQuery: "найден" });
  assert.equal(page.paginationTotalCount, 1);
  assert.equal(page.page, 1);
  assert.equal(page.items[0].id, rows[0].id);
});


test("multiple roles include creators with either role and toggle links remove only the selected role", async () => {
  const { CreatorMediaTypeChips } = await import("../src/app/creators/creator-media-type-chips");
  const mediaTypes = [{ code: "comic", name: "Комиксы", creatorsCount: 3, roles: [{ code: "screenwriter", name: "Сценарист", creatorsCount: 2 }, { code: "artist", name: "Художник", creatorsCount: 2 }] }];
  const input = rows.slice(0, 3).map((row, index) => ({ ...row, roles: index === 0 ? [{code:"screenwriter",name:"Сценарист"}] : index === 1 ? [{code:"artist",name:"Художник"}] : [] }));
  const page = paginatePublicCreators(input, { page: 1, pageSize: 24, roles: ["screenwriter", "artist"], searchQuery: "" });
  assert.deepEqual(new Set(page.items.map(item => item.id)), new Set([input[0].id, input[1].id]));
  const html = renderToStaticMarkup(createElement(CreatorMediaTypeChips, { mediaTypes, selectedMediaType: "comic", selectedRoles: ["screenwriter", "artist"], searchQuery: "" }));
  assert.match(html, /href="\/creators\?type=comic&amp;role=artist"/);
  assert.match(html, /href="\/creators\?type=comic&amp;role=screenwriter"/);
  assert.equal((html.match(/aria-current="true"/g) ?? []).length, 2);
});
