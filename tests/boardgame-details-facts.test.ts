import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaItemCreatorLinks } from "@/components/archive/media-item-creator-links";
import { BoardgameDetailsFacts } from "@/components/archive/boardgame-details-facts";
import { MediaMetadataFacts } from "@/components/ui/media-metadata-facts";

import { formatBoardgameRange, getBoardgameFactValues, getStringListFact } from "@/lib/media/metadata-facts";

test("previously imported BGG categories decode numeric entities as plain text", () => {
  assert.deepEqual(getStringListFact({ bggItemType: "boardgame", genres: ["Children&#039;s Game", "Children's Game", "Pick &#x26; Pass"] }, "genres"), ["Children's Game", "Pick & Pass"]);
});

test("boardgame ranges combine bounds, collapse equal values and retain partial bounds", () => {
  assert.equal(formatBoardgameRange(2, 5), "2–5");
  assert.equal(formatBoardgameRange(2, 2), "2");
  assert.equal(formatBoardgameRange(2, null), "от 2");
  assert.equal(formatBoardgameRange(null, 5), "до 5");
  assert.equal(formatBoardgameRange(5, 2), null);
  assert.equal(formatBoardgameRange(0, -1), null);
  assert.equal(formatBoardgameRange("2", NaN), null);
});

test("boardgame detail values show authors, age, players, time and translated type", () => {
  assert.deepEqual(getBoardgameFactValues({
    authors: ["Автор А", "Автор Б"], minAge: 8,
    minPlayers: 2, maxPlayers: 5,
    minPlayingTimeMinutes: 30, maxPlayingTimeMinutes: 60, runtimeMinutes: 60,
    bggItemType: "boardgameexpansion",
  }), {
    authors: "Автор А, Автор Б", age: "8+", players: "2–5", playingTime: "30–60 мин.", type: "Дополнение",
  });
  assert.equal(getBoardgameFactValues({ bggItemType: "boardgame" }).type, "Самостоятельная игра");
});

test("boardgame duration uses runtime only when a valid range is unavailable", () => {
  assert.equal(getBoardgameFactValues({ runtimeMinutes: 45 }).playingTime, "45 мин.");
  assert.equal(getBoardgameFactValues({ minPlayingTimeMinutes: 30, runtimeMinutes: 45 }).playingTime, "от 30 мин.");
  assert.equal(getBoardgameFactValues({ minPlayingTimeMinutes: 45, maxPlayingTimeMinutes: 45 }).playingTime, "45 мин.");
});

test("missing or malformed boardgame facts do not fabricate details", () => {
  const empty = { authors: null, age: null, players: null, playingTime: null, type: null };
  assert.deepEqual(getBoardgameFactValues(null), empty);
  assert.deepEqual(getBoardgameFactValues({ authors: [], minAge: 0, runtimeMinutes: -1, bggItemType: "unknown" }), empty);
});


test("hidden unified boardgame genres do not return through provider fallback", () => {
  const facts = { genres: ["Western"], minAge: 8 };
  const hidden = renderToStaticMarkup(createElement(BoardgameDetailsFacts, { facts, genres: [], hasUnifiedGenres: true }));
  assert.doesNotMatch(hidden, /Western|Жанры/);
  assert.match(hidden, /8\+/);
  const legacy = renderToStaticMarkup(createElement(BoardgameDetailsFacts, { facts, genres: [], hasUnifiedGenres: false }));
  assert.match(legacy, /Western/);
  const visible = renderToStaticMarkup(createElement(BoardgameDetailsFacts, {
    facts, genres: [{ id: 1, slug: "western", name: "Дикий запад" }], hasUnifiedGenres: true,
  }));
  assert.match(visible, /Дикий запад/);
  assert.doesNotMatch(visible, /Western/);
});

test("structured BGG creator roles display approved links and suppress raw fallback independently", () => {
  const facts = { bggCreators: [], authors: ["Raw Designer"], artists: ["Raw Artist"], minAge: 8 };
  const creators = [
    { id: 1, name: "Принятый дизайнер", slug: "designer", roleCode: "designer", roleName: "Геймдизайнер" },
    { id: 1, name: "Принятый дизайнер", slug: "designer", roleCode: "artist", roleName: "Художник" },
  ];
  const html = renderToStaticMarkup(createElement(BoardgameDetailsFacts, { facts, genres: [], creators }));
  assert.equal((html.match(/href="\/archive\?creator=designer"/g) ?? []).length, 2);
  assert.match(html, /Геймдизайнеры/);
  assert.match(html, /Художники/);
  assert.doesNotMatch(html, /Raw Designer|Raw Artist/);
  const pending = renderToStaticMarkup(createElement(BoardgameDetailsFacts, { facts, genres: [], creators: [] }));
  assert.doesNotMatch(pending, /Raw Designer|Raw Artist|Геймдизайнеры|Художники/);
  assert.match(pending, /8\+/);
  const legacy = renderToStaticMarkup(createElement(BoardgameDetailsFacts, { facts: { authors: ["Raw Designer"], artists: ["Raw Artist"] }, genres: [] }));
  assert.match(legacy, /Raw Designer/);
  assert.match(legacy, /Raw Artist/);
  const metadata = renderToStaticMarkup(createElement(MediaMetadataFacts, { metadata: { facts, sourceProvider: "bgg", sourceExternalId: "1", sourceUrl: null } }));
  assert.doesNotMatch(metadata, /bggCreators|Raw Designer|Raw Artist/);
});


test("creator lists collapse to ten only when more than five names would be hidden", () => {
  for (const count of [0, 10, 11, 15, 16, 40]) {
    for (const linked of [false, true]) {
      const creators = Array.from({length:count}, (_,index) => ({id:index,name:`Creator ${index + 1} end`,slug:linked ? `creator-${index}` : null}));
      const html = renderToStaticMarkup(createElement(MediaItemCreatorLinks,{creators,mediaType:"boardgame"}));
      const visible = count > 15 ? 10 : count;
      assert.equal((html.match(/Creator \d+ end/g) ?? []).length, visible);
      assert.equal(html.includes(`показать все ${count}`), count > 15);
      assert.equal((html.match(/href=/g) ?? []).length, linked ? visible : 0);
      if (count > 15) assert.match(html,/aria-expanded="false"/);
      if (linked && count) assert.match(html,/type=boardgame/);
    }
  }
  const legacy = renderToStaticMarkup(createElement(BoardgameDetailsFacts,{facts:{artists:Array.from({length:16},(_,index)=>`Artist ${index + 1} end`)},genres:[]}));
  assert.equal((legacy.match(/Artist \d+ end/g) ?? []).length,10);
  assert.match(legacy,/показать все 16/);
});
