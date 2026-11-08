import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedEventDescription } from "../src/app/feed/event-description";
import { FeedDayGroups } from "../src/app/feed/day-groups";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { describeFeedEvent, formatFeedEventDate, groupFeedItemsByDay } from "../src/app/feed/presentation";
import type { FeedItem } from "../src/lib/feed/model";

test("feed descriptions use user-facing scores, authors and neutral editorial fallbacks", () => {
  const base = { actorName: "Антон", score: 80, reviewTitle: "Рецензия" } as FeedItem;
  assert.equal(describeFeedEvent({ ...base, kind: "rating" }), "Ваш друг Антон поставил оценку");
  assert.equal(describeFeedEvent({ ...base, kind: "achievement" }), "Ваш друг Антон получил ачивку");
  assert.equal(describeFeedEvent({ ...base, kind: "wanted" }), "Ваш друг Антон добавил запись в желаемое");
  assert.equal(describeFeedEvent({ ...base, kind: "media" }), "Антон добавил новую запись");
  assert.equal(describeFeedEvent({ ...base, actorName: null, kind: "media" }), "В архив добавлена новая запись");
  assert.equal(describeFeedEvent({ ...base, actorName: null, kind: "series" }), "В архив добавлена новая серия");
  assert.equal(describeFeedEvent({ ...base, kind: "review" }), "Антон добавил рецензию «Рецензия»");
  assert.equal(describeFeedEvent({ ...base, kind: "collection" }), "Редакция добавила новую подборку");
  assert.match(formatFeedEventDate("2026-11-07T23:00:00.000000Z"), /8 ноября/);
});

test("feed page is dynamic, uses current access settings and exposes its navigation entry", () => {
  const page = readFileSync("src/app/feed/page.tsx", "utf8");
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /getPublicSiteHeaderState/);
  assert.match(page, /getEffectiveMediaTypeOptions\(header.author\?\.id\)/);
  assert.match(page, /type.isEnabled/);
  assert.match(page, /parseFeedCursor/);
  assert.match(page, /query.before !== undefined && query.after !== undefined/);
  assert.match(page, /prefetch=\{false\}/);
  assert.match(page, /В начало ленты/);
  assert.match(page, /В конец ленты/);
  assert.match(page, /ChevronFirst/);
  assert.match(page, /ChevronLast/);
  assert.match(page, /type="button" disabled/);
  assert.match(readFileSync("src/app/feed/event-card.tsx", "utf8"), /break-words/);
  const header = readFileSync("src/components/archive/public-site-header.tsx", "utf8");
  assert.match(header, /href[:=]\s*["']\/feed["']/);
});

test("actor names link to accessible profiles and remain escaped text otherwise", () => {
  const item = { kind: "rating", actorName: "Друг <Антон>", actorId: 42, score: 80 } as FeedItem;
  const html = renderToStaticMarkup(createElement(FeedEventDescription, { item }));
  assert.match(html, /href="\/users\/42"/);
  assert.match(html, /Друг &lt;Антон&gt;/);
  assert.match(html, /Ваш друг/);
  assert.doesNotMatch(html, /Пользователь/);
  const privateProfile = renderToStaticMarkup(createElement(FeedEventDescription, { item: { ...item, actorId: null } }));
  assert.doesNotMatch(privateProfile, /<a/);
});

test("feed groups the current page by Moscow date, preserves event order and displays the date only once per group", () => {
  const items: FeedItem[] = ["2026-11-07T23:00:00.000000Z", "2026-11-07T21:00:00.000000Z", "2026-11-07T20:59:00.000000Z"].map((at, index) => ({
    key: `media-${index}`, kind: "media", cursor: { at, kind: 1, id: index + 1 },
    href: `/media/entry-${index}`, title: `Запись ${index}`, imageUrl: null,
    actorName: "Антон", actorId: 42, actorIsFriend: false, score: null, partLabel: null, reviewTitle: null,
  }));
  const groups = groupFeedItemsByDay(items);
  assert.deepEqual(groups.map(group => group.day), ["2026-11-08", "2026-11-07"]);
  assert.deepEqual(groups[0].items.map(item => item.key), ["media-0", "media-1"]);
  assert.deepEqual(groupFeedItemsByDay([]), []);
  const html = renderToStaticMarkup(createElement(FeedDayGroups, { items }));
  assert.equal((html.match(/<time\b/g) ?? []).length, 2);
  assert.equal((html.match(/<li\b/g) ?? []).length, 3);
  assert.match(html, /8 ноября/);
  assert.match(html, /href="\/users\/42"/);
  assert.doesNotMatch(html, /23:00|21:00|20:59/);
});

test("activity selector resets the cursor and pagination preserves its server filter", () => {
  const page = readFileSync("src/app/feed/page.tsx", "utf8");
  assert.match(page, /header.author \? <FeedActivityFilter/);
  const filter = readFileSync("src/app/feed/activity-filter.tsx", "utf8");
  assert.match(filter, /<ArchiveSelect/);
  assert.match(filter, /indent: true/);
  assert.match(filter, /value: "friends", label: "Друзья"/);
  assert.match(filter, /Вся активность/);
  assert.match(filter, /\/feed\?friend=/);
  assert.match(page, /getFeedPage\(\{ friendsOnly,/);
  assert.match(page, /\/feed\?friends=1/);
  assert.match(page, /pageHref\("after", page.newer\)/);
  assert.match(page, /pageHref\("before", page.older\)/);
  assert.match(page, /href: page.newer \? startHref : null/);
});

test("current author is addressed as Вы with plural verbs and a profile link", () => {
  const item = { kind: "media", actorName: "Антон", actorId: 42 } as FeedItem;
  assert.equal(describeFeedEvent(item, 42), "Вы добавили новую запись");
  assert.equal(describeFeedEvent({ ...item, kind: "series" }, 42), "Вы добавили новую серию");
  assert.equal(describeFeedEvent({ ...item, kind: "review" }, 42), "Вы добавили рецензию");
  assert.equal(describeFeedEvent(item, 43), "Антон добавил новую запись");
  assert.equal(describeFeedEvent(item), "Антон добавил новую запись");
  const html = renderToStaticMarkup(createElement(FeedEventDescription, { item, currentAuthorId: 42 }));
  assert.match(html, /href="\/users\/42"/);
  assert.match(html, />Вы<\/a> добавили новую запись/);
});

test("public archive events identify friends while keeping self and other authors distinct", () => {
  const item = { actorName: "Антон", actorId: 42, actorIsFriend: true } as FeedItem;
  for (const [kind, action] of [["media", "новую запись"], ["series", "новую серию"], ["review", "рецензию"]] as const) {
    assert.equal(describeFeedEvent({ ...item, kind }, 7), `Ваш друг Антон добавил ${action}`);
    assert.equal(describeFeedEvent({ ...item, kind }, 42), `Вы добавили ${action}`);
    assert.equal(describeFeedEvent({ ...item, kind, actorIsFriend: false }, 7), `Антон добавил ${action}`);
  }
});

test("rating events display the compact score beside their description", () => {
  const item = { kind: "rating", actorName: "Антон", actorId: 42, score: 80 } as FeedItem;
  const html = renderToStaticMarkup(createElement(FeedEventDescription, { item }));
  assert.match(html, /поставил оценку/);
  assert.match(html, /inline-flex align-middle/);
  assert.match(html, /aria-label="Оценка автора: 8"/);
  assert.match(html, /size-6/);
});

test("feed displays event metadata even when no interactive tile was loaded", () => {
  const item = { key: "media-1", kind: "media", cursor: { at: "2026-11-07T00:00:00.000000Z", kind: 1, id: 1 }, href: "/media/test", title: "Запись", mediaTypeName: "Фильм", releaseYear: 1999, imageUrl: null, actorName: null, actorId: null, actorIsFriend: false, score: null, partLabel: null, reviewTitle: null } as FeedItem;
  const html = renderToStaticMarkup(createElement(FeedDayGroups, { items: [item] }));
  assert.match(html, /Фильм · 1999/);
  assert.match(html, /mt-auto pt-2/);
});
