import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  buildDemoHomeStatistics,
  DEMO_HOME_STATISTICS_CODE_LIMIT,
  normalizeDemoHomeStatisticsCodes,
  parseDemoHomeStatisticsMediaItems,
} from "../src/lib/user-state/demo-home-statistics"
import { createEmptyDemoProfile } from "../src/lib/user-state/demo-profile"

const routeSource = readFileSync("src/app/api/demo-home-statistics/route.ts", "utf8")
const querySource = readFileSync("src/db/queries/demo-home-statistics.ts", "utf8")
const wrapperSource = readFileSync(
  "src/components/user-state/home-author-statistics-with-demo.tsx",
  "utf8",
)

describe("demo home statistics", () => {
  it("builds both chart distributions without mixing unknown metadata", () => {
    const profile = createEmptyDemoProfile("2026-01-01T00:00:00.000Z")
    profile.ratings = {
      alpha: { score: 80, updatedAt: "2026-01-02T00:00:00.000Z" },
      beta: { score: 80, updatedAt: "2026-01-03T00:00:00.000Z" },
      gamma: { score: 60, updatedAt: "2026-01-04T00:00:00.000Z" },
      missing: { score: 100, updatedAt: "2026-01-05T00:00:00.000Z" },
    }

    assert.deepEqual(buildDemoHomeStatistics(profile, [
      { code: "alpha", mediaType: "book", releaseYear: 1999 },
      { code: "beta", mediaType: "book", releaseYear: 1999 },
      { code: "gamma", mediaType: "movie", releaseYear: null },
      { code: "alpha", mediaType: "book", releaseYear: 1999 },
      { code: "unknown", mediaType: "game", releaseYear: 2005 },
    ]), {
      releaseYearDistribution: [{ count: 2, year: 1999 }],
      releaseYearMediaTypeDistribution: [{ count: 2, mediaType: "book", year: 1999 }],
      scoreDistribution: [
        { ratingsCount: 1, score: 60 },
        { ratingsCount: 2, score: 80 },
        { ratingsCount: 1, score: 100 },
      ],
      scoreMediaTypeDistribution: [
        { mediaType: "movie", ratingsCount: 1, score: 60 },
        { mediaType: "book", ratingsCount: 2, score: 80 },
      ],
    })
  })

  it("rejects malformed endpoint data", () => {
    assert.deepEqual(parseDemoHomeStatisticsMediaItems({ items: [
      { code: "valid", mediaType: "book", releaseYear: 2001 },
      { code: "", mediaType: "book", releaseYear: 2002 },
      { code: "bad-year", mediaType: "book", releaseYear: "2003" },
      null,
    ] }), [
      { code: "valid", mediaType: "book", releaseYear: 2001 },
    ])
    assert.deepEqual(parseDemoHomeStatisticsMediaItems(null), [])
  })

  it("queries only published records through a bounded endpoint", () => {
    const codes = Array.from(
      { length: DEMO_HOME_STATISTICS_CODE_LIMIT + 2 },
      (_, index) => `item-${index}`,
    )
    assert.equal(normalizeDemoHomeStatisticsCodes([
      "item-0",
      "item-0",
      "",
      null,
      "x".repeat(201),
      ...codes,
    ]).length, DEMO_HOME_STATISTICS_CODE_LIMIT)
    assert.match(routeSource, /getDemoHomeStatisticsMediaItems/)
    assert.match(querySource, /normalizeDemoHomeStatisticsCodes/)
    assert.match(querySource, /inArray\(mediaItems\.code, uniqueCodes\)/)
    assert.match(querySource, /eq\(mediaItems\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/)
  })

  it("keeps server precedence and reacts to canonical demo-profile snapshots", () => {
    assert.match(wrapperSource, /serverSummary === null/)
    assert.match(wrapperSource, /serverSummary \?\? demoSummary/)
    assert.match(wrapperSource, /profile\.import\.importedAt == null/)
    assert.match(wrapperSource, /ratedCodesKey/)
    assert.match(wrapperSource, /useDemoProfile\(\)/)
    assert.match(wrapperSource, /if \(!summary\) return null/)
  })
})
