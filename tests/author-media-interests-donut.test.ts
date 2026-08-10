import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  formatDonutLabel,
  getDonutDescription,
  getDonutSegments,
  getMediaInterestColor,
  getMediaInterestTotal,
  spreadDonutLabelPositions,
} from "../src/app/author/(protected)/author-media-interests-donut";

const source = readFileSync(
  "src/app/author/(protected)/author-media-interests-donut.tsx",
  "utf8",
);
const dashboardSource = readFileSync(
  "src/components/author/author-statistics.tsx",
  "utf8",
);
const panelSource = readFileSync(
  "src/app/author/(protected)/author-media-interests-panel.tsx",
  "utf8",
);

describe("author media interests donut", () => {
  it("builds proportional segments only for positive counts with bounded gaps", () => {
    const segments = getDonutSegments([
      { code: "game", count: 3, label: "Игры" },
      { code: "film", count: 1, label: "Фильмы" },
      { code: "book", count: 0, label: "Книги" },
    ]);

    assert.deepEqual(segments.map(({ code }) => code), ["game", "film"]);
    assert.equal(Math.round(segments[0].percent), 75);
    assert.equal(Math.round(segments[1].percent), 25);
    assert.equal(segments[0].dashOffset, 0);
    assert.ok(segments.every(({ dashLength }) => dashLength > 0));
    for (const side of ["left", "right"] as const) {
      const positions = segments
        .filter((segment) => segment.side === side)
        .map(({ labelY }) => labelY)
        .sort((a, b) => a - b);
      assert.ok(positions.every((position, index) => index === 0 || position - positions[index - 1] >= 18));
    }
  });

  it("spreads crowded labels within SVG bounds", () => {
    const positions = spreadDonutLabelPositions([20, 22, 24, 26, 28, 30]);

    assert.ok(positions[0] >= 12);
    assert.ok(positions.at(-1)! <= 158);
    assert.ok(positions.every((position, index) => index === 0 || position - positions[index - 1] >= 18));
  });

  it("compresses crowded labels while keeping them ordered inside bounds", () => {
    const positions = spreadDonutLabelPositions(Array.from({ length: 12 }, () => 95));

    assert.equal(positions.length, 12);
    assert.ok(positions.every((position) => position >= 12 && position <= 158));
    assert.ok(positions.every((position, index) => index === 0 || position >= positions[index - 1]));
  });

  it("keeps standard and fallback colors stable", () => {
    assert.equal(getMediaInterestColor("game"), "#6c765f");
    assert.equal(getMediaInterestColor("film"), "#66747a");
    assert.equal(getMediaInterestColor("custom-type"), getMediaInterestColor("custom-type"));
    assert.match(getMediaInterestColor("custom-type"), /^#[0-9a-f]{6}$/);
  });

  it("handles an empty total without segments or division by zero", () => {
    const items = [
      { code: "game", count: 0, label: "Игры" },
      { code: "film", count: 0, label: "Фильмы" },
    ];

    assert.equal(getMediaInterestTotal(items), 0);
    assert.deepEqual(getDonutSegments(items), []);
    assert.equal(getDonutDescription(items), "Пока нет оценок по типам медиа.");
    assert.equal(
      getMediaInterestTotal([{ code: "invalid", count: -2, label: "Некорректный" }]),
      0,
    );
  });

  it("maps enabled media types to labels and counts on the server", () => {
    assert.match(
      dashboardSource,
      /const interestItems = mediaTypesByRatingCount\.map\(\(mediaType\) => \(\{[\s\S]*code: mediaType\.code,[\s\S]*count: distributionByMediaType\.get\(mediaType\.code\) \?\? 0,[\s\S]*label: getMediaTypeLabel\(mediaType\.code, mediaTypes\)/,
    );
    assert.match(
      dashboardSource,
      /<AuthorMediaInterestsPanel[\s\S]*items=\{interestItems\}/,
    );
    assert.match(panelSource, /<AuthorMediaInterestsDonut items=\{items\} \/>/);
  });

  it("provides full accessible text while hover remains a visual enhancement", () => {
    assert.equal(
      getDonutDescription([
        { code: "film", count: 12, label: "Фильмы" },
        { code: "game", count: 18, label: "Игры" },
        { code: "book", count: 0, label: "Книги" },
      ]),
      "Всего 30 оценок. Фильмы: 12 оценок, 40%; Игры: 18 оценок, 60%.",
    );
    assert.match(source, /const \[hoveredCode, setHoveredCode\]/);
    assert.doesNotMatch(source, /focusedCode|onFocus|onBlur|tabIndex|role="button"/);
    assert.match(source, /const activeCode = hoveredCode/);
    assert.match(source, /role="img"/);
    assert.match(source, /<title id=\{titleId\}>/);
    assert.match(source, /<desc id=\{descriptionId\}>/);
    assert.match(source, /onPointerLeave=\{\(\) => setHoveredCode\(null\)\}/);
    assert.match(source, /<g[\s\S]*aria-hidden="true"[\s\S]*onPointerEnter/);
    assert.match(source, /motion-reduce:transition-none/);
  });

  it("truncates only visual labels and keeps full labels in the description", () => {
    assert.equal(formatDonutLabel("Очень длинный пользовательский тип"), "Очень длинный п…");
    assert.equal(formatDonutLabel("Короткий"), "Короткий");
    assert.match(source, /formatDonutLabel\(segment\.label\)/);
    assert.match(source, /getDonutDescription\(items\)/);
    assert.match(source, /strokeLinecap="butt"/);
    assert.match(source, /dominantBaseline="middle"[\s\S]*y=\{segment\.labelY\}/);
    assert.doesNotMatch(source, /segment\.count\} · \{Math\.round\(segment\.percent\)/);
  });

  it("keeps labels and leader lines inside a responsive wide SVG", () => {
    assert.match(source, /viewBox="0 0 260 170"/);
    assert.match(source, /mx-auto block h-auto w-full max-w-\[30rem\]/);
    assert.match(
      source,
      /<polyline[\s\S]*points=\{`\$\{segment\.leaderAnchorX\},\$\{segment\.leaderAnchorY\} \$\{segment\.side === "left" \? 78 : 182\},\$\{segment\.labelY\} \$\{segment\.leaderEndX\},\$\{segment\.labelY\}`\}/,
    );
    assert.doesNotMatch(source, /leaderStart|leaderElbowY/);
    assert.match(source, /segment\.label/);
    assert.doesNotMatch(source, /<button|aria-pressed|grid-cols/);
    assert.match(source, /Пока нет оценок/);
  });
});
