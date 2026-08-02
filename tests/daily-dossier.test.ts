import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  type DailyDossierRedisClient,
  getDailyDossierCacheKey,
  getDailyDossierWithDependencies,
  getSecondsUntilNextUtcMidnight,
  getUtcDateKey,
} from "@/lib/main-page/daily-dossier";
import type { MainPageMediaItem } from "@/db/queries/main-page";
import {
  DEFAULT_DAILY_DOSSIER_MIN_AVERAGE_SCORE,
  parseDailyDossierMinAverageScore,
} from "@/lib/main-page/daily-dossier-settings";

function item(id: number): MainPageMediaItem {
  return {
    averageScore: 80,
    code: `item-${id}`,
    coverThumbUrl: null,
    coverUrl: null,
    currentAuthorScore: null,
    id,
    mediaCarrierCode: null,
    mediaType: "film",
    metadataFacts: null,
    ratingsCount: 1,
    releaseYear: 2026,
    title: `Запись ${id}`,
  };
}

describe("daily dossier UTC cache helpers", () => {
  it("builds a stable key from the UTC calendar date", () => {
    const beforeUtcMidnight = new Date("2026-08-01T23:59:59.250Z");
    const afterUtcMidnight = new Date("2026-08-02T00:00:00.000Z");

    assert.equal(getUtcDateKey(beforeUtcMidnight), "2026-08-01");
    assert.equal(getDailyDossierCacheKey(beforeUtcMidnight), "main-page:daily-dossier:2026-08-01");
    assert.equal(getDailyDossierCacheKey(afterUtcMidnight), "main-page:daily-dossier:2026-08-02");
  });

  it("returns a ceiling TTL to the next UTC midnight", () => {
    assert.equal(
      getSecondsUntilNextUtcMidnight(new Date("2026-08-01T23:59:59.250Z")),
      1,
    );
    assert.equal(
      getSecondsUntilNextUtcMidnight(new Date("2026-08-01T12:00:00.000Z")),
      43_200,
    );
    assert.equal(
      getSecondsUntilNextUtcMidnight(new Date("2026-12-31T23:59:00.000Z")),
      60,
    );
  });

  it("keeps the global candidate eligibility independent from personal settings", () => {
    const source = readFileSync("src/db/queries/main-page.ts", "utf8");

    assert.match(source, /eq\(mediaItems\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/);
    assert.match(source, /eq\(mediaTypes\.isPubliclyAvailable, true\)/);
    assert.match(source, /eq\(mediaTypes\.isAvailableToGuests, true\)/);
    assert.match(source, /eq\(mediaTypes\.enabledByDefault, true\)/);
    assert.match(source, /\.leftJoin\(ratings, eq\(ratings\.mediaItemId, mediaItems\.id\)\)/);
    assert.match(source, /minAverageScore > 0[\s\S]*averageScoreSql\} >= \$\{minAverageScore \* 10\}[\s\S]*: undefined/);
  });

  it("parses the configured whole-score threshold", () => {
    assert.equal(DEFAULT_DAILY_DOSSIER_MIN_AVERAGE_SCORE, 6);
    assert.equal(parseDailyDossierMinAverageScore("0"), 0);
    assert.equal(parseDailyDossierMinAverageScore(10), 10);
    assert.equal(parseDailyDossierMinAverageScore(-1), null);
    assert.equal(parseDailyDossierMinAverageScore(11), null);
    assert.equal(parseDailyDossierMinAverageScore(6.5), null);
    assert.equal(parseDailyDossierMinAverageScore(""), null);
    assert.equal(parseDailyDossierMinAverageScore(null), null);
    assert.equal(parseDailyDossierMinAverageScore(false), null);
    assert.equal(parseDailyDossierMinAverageScore(true), null);
  });

  it("persists and exposes the dossier threshold in general settings", () => {
    const schema = readFileSync("src/db/schema.ts", "utf8");
    const migration = readFileSync(
      "drizzle/0049_daily_dossier_min_average_score.sql",
      "utf8",
    );
    const settingsQuery = readFileSync("src/db/queries/archive-settings.ts", "utf8");
    const settingsAction = readFileSync(
      "src/app/admin/(protected)/settings/actions.ts",
      "utf8",
    );
    const settingsForm = readFileSync(
      "src/app/admin/(protected)/settings/archive/archive-settings-form.tsx",
      "utf8",
    );
    const service = readFileSync("src/lib/main-page/daily-dossier.ts", "utf8");

    assert.match(schema, /dailyDossierMinAverageScore: integer\("daily_dossier_min_average_score"\)[\s\S]*\.default\(6\)[\s\S]*\.notNull\(\)/);
    assert.match(schema, /daily_dossier_min_average_score_check[\s\S]*between 0 and 10/);
    assert.match(migration, /daily_dossier_min_average_score[\s\S]*DEFAULT 6 NOT NULL/);
    assert.match(migration, /BETWEEN 0 AND 10/);
    assert.match(settingsQuery, /parseDailyDossierMinAverageScore/);
    assert.match(settingsAction, /dailyDossierMinAverageScore[\s\S]*metadata/);
    assert.match(settingsForm, /Минимальная средняя оценка «Досье дня»/);
    assert.match(service, /getArchiveSettings\(\)[\s\S]*settings\.dailyDossierMinAverageScore/);
  });

  it("reads the persisted winner after losing a SET NX race", async () => {
    let storedValue: string | null = null;
    const client = {
      get: async () => storedValue,
      set: async () => {
        storedValue = "2";
        return null;
      },
      eval: async () => 0,
    } as unknown as DailyDossierRedisClient;

    const result = await getDailyDossierWithDependencies({
      client,
      getEligibleById: async (id) => id === 2 ? item(2) : null,
      getRandomCandidate: async () => item(1),
    }, new Date("2026-08-01T12:00:00.000Z"));

    assert.equal(result?.id, 2);
  });

  it("atomically replaces an ineligible cached ID", async () => {
    let storedValue: string | null = "999";
    const client = {
      get: async () => storedValue,
      set: async () => null,
      eval: async (_script: string, options: { arguments: string[] }) => {
        if (storedValue !== options.arguments[0]) {
          return 0;
        }

        storedValue = options.arguments[1];
        return 1;
      },
    } as unknown as DailyDossierRedisClient;

    const result = await getDailyDossierWithDependencies({
      client,
      getEligibleById: async () => null,
      getRandomCandidate: async () => item(3),
    }, new Date("2026-08-01T12:00:00.000Z"));

    assert.equal(result?.id, 3);
    assert.equal(storedValue, "3");
  });

  it("falls back to a DB candidate when Redis fails", async () => {
    const client = {
      get: async () => {
        throw new Error("Redis unavailable");
      },
      set: async () => null,
      eval: async () => 0,
    } as unknown as DailyDossierRedisClient;

    const result = await getDailyDossierWithDependencies({
      client,
      getEligibleById: async () => null,
      getRandomCandidate: async () => item(4),
    }, new Date("2026-08-01T12:00:00.000Z"));

    assert.equal(result?.id, 4);
  });
});
