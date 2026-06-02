import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sortMediaTypesByCount, type MediaTypeOption } from "../src/lib/media-types";

const mediaTypes = [
  { code: "game", name: "Игры", description: null },
  { code: "film", name: "Фильмы", description: null },
  { code: "book", name: "Книги", description: null },
  { code: "other", name: "Другое", description: null },
] satisfies MediaTypeOption[];

describe("sortMediaTypesByCount", () => {
  it("sorts media types by count and keeps other last", () => {
    const sorted = sortMediaTypesByCount(mediaTypes, [
      { mediaType: "other", count: 100 },
      { mediaType: "film", count: 7 },
      { mediaType: "game", count: 12 },
      { mediaType: "book", count: 7 },
    ]);

    assert.deepEqual(
      sorted.map((mediaType) => mediaType.code),
      ["game", "book", "film", "other"],
    );
  });

  it("does not mutate the original list", () => {
    const sorted = sortMediaTypesByCount(mediaTypes, [{ mediaType: "film", count: 1 }]);

    assert.notEqual(sorted, mediaTypes);
    assert.deepEqual(
      mediaTypes.map((mediaType) => mediaType.code),
      ["game", "film", "book", "other"],
    );
  });
});
