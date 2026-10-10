import assert from "node:assert/strict";
import { test } from "node:test";

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
