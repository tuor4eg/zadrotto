import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_TOP_ARCHIVE_MIN_AVERAGE_SCORE,
  DEFAULT_TOP_ARCHIVE_MIN_RATINGS_COUNT,
  getRotatedMediaTypeCodes,
  parseTopArchiveMinAverageScore,
  parseTopArchiveMinRatingsCount,
  roundRobinMediaTypeItems,
} from "@/lib/main-page/top-archive-settings";

describe("top archive settings", () => {
  it("parses strict integer thresholds", () => {
    assert.equal(DEFAULT_TOP_ARCHIVE_MIN_AVERAGE_SCORE, 0);
    assert.equal(DEFAULT_TOP_ARCHIVE_MIN_RATINGS_COUNT, 1);
    assert.equal(parseTopArchiveMinAverageScore("0"), 0);
    assert.equal(parseTopArchiveMinAverageScore(10), 10);
    assert.equal(parseTopArchiveMinAverageScore(11), null);
    assert.equal(parseTopArchiveMinAverageScore(null), null);
    assert.equal(parseTopArchiveMinRatingsCount(0), 0);
    assert.equal(parseTopArchiveMinRatingsCount("1000"), 1000);
    assert.equal(parseTopArchiveMinRatingsCount(1001), null);
    assert.equal(parseTopArchiveMinRatingsCount(false), null);
  });

  it("rotates a stable media type order once per UTC date", () => {
    const first = getRotatedMediaTypeCodes(
      ["series", "book", "film", "book"],
      new Date("2026-08-02T23:59:59.999Z"),
    );
    const sameDay = getRotatedMediaTypeCodes(
      ["film", "series", "book"],
      new Date("2026-08-02T00:00:00.000Z"),
    );
    const nextDay = getRotatedMediaTypeCodes(
      ["film", "series", "book"],
      new Date("2026-08-03T00:00:00.000Z"),
    );

    assert.deepEqual(first, sameDay);
    assert.deepEqual(nextDay, [...sameDay.slice(1), sameDay[0]]);
  });

  it("round-robins groups without changing order inside a type", () => {
    assert.deepEqual(
      roundRobinMediaTypeItems([["f1", "f2", "f3"], ["b1"], ["g1", "g2"]], 5),
      ["f1", "b1", "g1", "f2", "g2"],
    );
    assert.deepEqual(roundRobinMediaTypeItems([[], ["b1"]], 12), ["b1"]);
  });

  it("wires schema, migration, admin settings and main query thresholds", () => {
    const schema = readFileSync("src/db/schema.ts", "utf8");
    const migration = readFileSync("drizzle/0051_top_archive_settings.sql", "utf8");
    const settings = readFileSync("src/db/queries/archive-settings.ts", "utf8");
    const action = readFileSync("src/app/admin/(protected)/settings/actions.ts", "utf8");
    const form = readFileSync(
      "src/app/admin/(protected)/settings/archive/archive-settings-form.tsx",
      "utf8",
    );
    const page = readFileSync("src/app/main/page.tsx", "utf8");
    const query = readFileSync("src/db/queries/main-page.ts", "utf8");

    assert.match(schema, /topArchiveMinAverageScore: integer\("top_archive_min_average_score"\)\.default\(0\)\.notNull\(\)/);
    assert.match(schema, /topArchiveMinRatingsCount: integer\("top_archive_min_ratings_count"\)\.default\(1\)\.notNull\(\)/);
    assert.match(migration, /top_archive_min_ratings_count[\s\S]*BETWEEN 0 AND 1000/);
    assert.match(settings, /topArchiveMinAverageScore[\s\S]*topArchiveMinRatingsCount/);
    assert.match(action, /metadata:[\s\S]*topArchiveMinAverageScore[\s\S]*topArchiveMinRatingsCount/);
    assert.match(form, /Минимальная средняя оценка «Топа архива»/);
    assert.match(form, /Значение 0 отключает ограничение и допускает записи без оценок/);
    assert.match(page, /getArchiveSettings\(\)[\s\S]*topArchiveMinAverageScore: archiveSettings\.topArchiveMinAverageScore/);
    assert.match(query, /topArchiveMinAverageScore \* 10/);
    assert.match(query, /ratingsCountSql[\s\S]*topArchiveMinRatingsCount/);
    assert.match(query, /averageScoreSql\} desc nulls last[\s\S]*ratingsCountSql\} desc[\s\S]*lower\(\$\{mediaItems\.title\}\) asc[\s\S]*mediaItems\.id\} asc/);
    assert.match(query, /getRotatedMediaTypeCodes[\s\S]*roundRobinMediaTypeItems/);
  });
});
