import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  getNiceScaleMaximum,
  getSmoothLinePath,
  getYearTickIndexes,
} from "../src/app/author/(protected)/author-media-interests-panel";

const panelSource = readFileSync(
  "src/app/author/(protected)/author-media-interests-panel.tsx",
  "utf8",
);
const querySource = readFileSync("src/db/queries/ratings.ts", "utf8");

describe("author interests by release year", () => {
  it("uses a readable integer scale with headroom", () => {
    assert.equal(getNiceScaleMaximum(0), 4);
    assert.equal(getNiceScaleMaximum(3), 4);
    assert.equal(getNiceScaleMaximum(6), 8);
    assert.equal(getNiceScaleMaximum(24), 40);
  });

  it("limits year labels while preserving the first and last rated years", () => {
    assert.deepEqual(getYearTickIndexes(3), [0, 1, 2]);
    assert.deepEqual(getYearTickIndexes(12), [0, 3, 6, 8, 11]);
  });

  it("creates a smooth path through every chart point", () => {
    assert.equal(
      getSmoothLinePath([
        { x: 10, y: 40 },
        { x: 20, y: 20 },
        { x: 30, y: 30 },
      ]),
      "M 10 40 C 15 40, 15 20, 20 20 C 25 20, 25 30, 30 30",
    );
  });

  it("groups the author's ratings by known media release year", () => {
    assert.match(querySource, /releaseYearDistribution/);
    assert.match(querySource, /year: mediaItems\.releaseYear/);
    assert.match(querySource, /isNotNull\(mediaItems\.releaseYear\)/);
    assert.match(querySource, /groupBy\(mediaItems\.releaseYear\)/);
    assert.match(querySource, /orderBy\(asc\(mediaItems\.releaseYear\)\)/);
  });

  it("uses only rated years as evenly spaced categories", () => {
    assert.match(panelSource, /items\.map\(\(item, index\) =>/);
    assert.match(panelSource, /index \/ \(items\.length - 1\)/);
    assert.doesNotMatch(panelSource, /lastYear - firstYear|item\.year - firstYear/);
  });

  it("renders accessible tabs, chart axes and an explicit empty state", () => {
    assert.match(panelSource, /role="tablist"/);
    assert.match(panelSource, /\['types', 'По типам'\][\s\S]*\['years', 'По годам'\]/);
    assert.match(panelSource, /useState<"types" \| "years">\("types"\)/);
    assert.match(panelSource, /Оценки по годам выпуска записей/);
    assert.match(panelSource, /Пока нет оценённых записей с годом выпуска\./);
    assert.match(panelSource, /getSmoothLinePath\(points\)/);
  });
});
