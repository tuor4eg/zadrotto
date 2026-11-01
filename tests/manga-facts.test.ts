import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMangaVolumeCount } from "../src/lib/media/manga-facts";
import { getMediaItemSummaryParts } from "../src/lib/media/media-item-summary";

test("manga volume counts require a number next to the volume marker", () => {
  for (const [status, count] of [
    ["5 volumes", 5], ["volumes 3", 3], ["4+ volumes", 4],
    ["7 Volumes (Complete)", 7], ["1 Volume (Ongoing)", 1],
    ["43 Volumes (Ongoing)\nA note about chapter 365", 43],
    ["volumes", null], ["chapter 5", null], ["volumes, chapter 5", null],
    ["0 volumes", null], ["1.5 volumes", null], ["volumes 1.5", null],
    ["9007199254740992 volumes", null], [null, null],
  ] as const) assert.equal(parseMangaVolumeCount(status), count, String(status));
});

test("manga displays issues like comics and uses only structured completion", () => {
  const summary = (metadataFacts: Record<string, unknown>) => getMediaItemSummaryParts({ mediaType: "manga", mediaTypeLabel: "Манга", releaseYear: null, metadataFacts });
  assert.deepEqual(summary({ status: "5 volumes" }), ["Манга", "5 выпусков"]);
  assert.deepEqual(summary({ status: "volumes 3" }), ["Манга", "3 выпуска"]);
  assert.deepEqual(summary({ status: "4+ volumes" }), ["Манга", "4 выпуска"]);
  assert.deepEqual(summary({ issueCount: 1, completed: true, status: "5 volumes" }), ["Манга", "1 выпуск", "Завершено"]);
  assert.deepEqual(summary({ status: "volumes, chapter 5", completed: false }), ["Манга"]);
  assert.deepEqual(summary({ status: "7 Volumes (Complete)" }), ["Манга", "7 выпусков"]);
});
