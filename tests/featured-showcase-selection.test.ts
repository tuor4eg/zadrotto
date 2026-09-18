import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { AchievementRarity } from "@/lib/achievements/model"
import {
  FEATURED_SHOWCASE_LIMIT,
  getFeaturedShowcaseCategory,
  getFeaturedShowcaseSignificance,
  selectFeaturedShowcaseAchievements,
  type FeaturedShowcaseCandidate,
} from "@/lib/achievements/featured-showcase"

function candidate(
  overrides: Partial<FeaturedShowcaseCandidate> & Pick<FeaturedShowcaseCandidate, "code">,
): FeaturedShowcaseCandidate {
  return {
    awardedAt: "2026-01-01T00:00:00.000Z",
    awardedThreshold: 10,
    highestAwardedLevel: 1,
    levelCount: 1,
    mechanic: "review.authored.count",
    params: {},
    rarity: "common",
    ...overrides,
  }
}

describe("featured showcase selection", () => {
  it("ranks rarity before everything else", () => {
    const selected = selectFeaturedShowcaseAchievements([
      candidate({ code: "common-new", rarity: "common", awardedAt: "2026-06-01T00:00:00.000Z" }),
      candidate({
        code: "legendary-old",
        rarity: "legendary",
        awardedAt: "2024-01-01T00:00:00.000Z",
      }),
      candidate({
        code: "epic",
        rarity: "epic",
        awardedAt: "2025-01-01T00:00:00.000Z",
        mechanic: "media.authored.count",
      }),
    ])

    assert.deepEqual(selected.map((item) => item.code), ["legendary-old", "epic", "common-new"])
  })

  it("prefers completed chains and higher levels within the same rarity", () => {
    const selected = selectFeaturedShowcaseAchievements([
      candidate({
        code: "low",
        rarity: "rare",
        highestAwardedLevel: 1,
        levelCount: 3,
      }),
      candidate({
        code: "mid",
        rarity: "rare",
        highestAwardedLevel: 2,
        levelCount: 3,
        mechanic: "media.authored.count",
      }),
      candidate({
        code: "done",
        rarity: "rare",
        highestAwardedLevel: 2,
        levelCount: 2,
        mechanic: "quiz.win.count",
      }),
    ])

    assert.deepEqual(selected.map((item) => item.code), ["done", "mid", "low"])
  })

  it("excludes starter and basic quantitative achievements entirely", () => {
    assert.equal(
      getFeaturedShowcaseSignificance(candidate({
        code: "series-rated-10",
        mechanic: "rating.authored.count",
        params: { seriesId: 7 },
      })),
      "thematic",
    )
    assert.equal(
      getFeaturedShowcaseSignificance(candidate({
        code: "films-rated-10",
        mechanic: "rating.authored.count",
        params: { mediaType: "film" },
      })),
      "basicQuantitative",
    )
    assert.equal(
      getFeaturedShowcaseSignificance(candidate({
        code: "first-rating",
        awardedThreshold: 1,
        mechanic: "rating.authored.count",
        params: {},
      })),
      "starter",
    )

    const selected = selectFeaturedShowcaseAchievements([
      candidate({
        code: "first-rating",
        awardedThreshold: 1,
        rarity: "legendary",
        mechanic: "rating.authored.count",
        params: {},
      }),
      candidate({
        code: "ratings-10",
        rarity: "epic",
        awardedThreshold: 10,
        mechanic: "rating.authored.count",
        params: {},
      }),
      candidate({
        code: "films-rated-10",
        rarity: "rare",
        mechanic: "rating.authored.count",
        params: { mediaType: "film" },
      }),
      candidate({
        code: "series-rated-10",
        rarity: "common",
        mechanic: "rating.authored.count",
        params: { seriesId: 3 },
      }),
    ])

    assert.deepEqual(selected.map((item) => item.code), ["series-rated-10"])
  })

  it("hides the showcase when there are no thematic candidates", () => {
    const selected = selectFeaturedShowcaseAchievements([
      candidate({
        code: "first-rating",
        awardedThreshold: 1,
        rarity: "legendary",
        mechanic: "rating.authored.count",
        params: {},
      }),
      candidate({
        code: "films-rated-10",
        rarity: "epic",
        mechanic: "rating.authored.count",
        params: { mediaType: "film" },
      }),
    ])

    assert.deepEqual(selected, [])
  })

  it("uses awardedAt only as the final tie-breaker", () => {
    const selected = selectFeaturedShowcaseAchievements([
      candidate({
        code: "older",
        rarity: "epic",
        awardedAt: "2024-01-01T00:00:00.000Z",
      }),
      candidate({
        code: "newer",
        rarity: "epic",
        awardedAt: "2026-01-01T00:00:00.000Z",
        mechanic: "media.authored.count",
      }),
    ])

    assert.deepEqual(selected.map((item) => item.code), ["newer", "older"])
  })

  it("limits one diversity category to two cards and keeps up to five", () => {
    assert.equal(FEATURED_SHOWCASE_LIMIT, 5)

    const selected = selectFeaturedShowcaseAchievements([
      candidate({
        code: "series-a",
        rarity: "legendary",
        mechanic: "rating.authored.count",
        params: { seriesId: 1 },
      }),
      candidate({
        code: "series-b",
        rarity: "epic",
        mechanic: "rating.authored.count",
        params: { seriesId: 2 },
      }),
      candidate({
        code: "series-c",
        rarity: "rare",
        mechanic: "rating.authored.count",
        params: { seriesId: 3 },
      }),
      candidate({ code: "review-a", rarity: "common", awardedThreshold: 5 }),
      candidate({
        code: "review-b",
        rarity: "common",
        awardedThreshold: 8,
        awardedAt: "2026-02-01T00:00:00.000Z",
      }),
      candidate({
        code: "media-a",
        rarity: "common",
        mechanic: "media.authored.count",
      }),
      candidate({
        code: "quiz-a",
        rarity: "common",
        mechanic: "quiz.win.count",
      }),
    ])

    assert.deepEqual(
      selected.map((item) => item.code),
      ["series-a", "series-b", "review-b", "review-a", "media-a"],
    )
    assert.equal(selected.length, 5)
    assert.equal(
      getFeaturedShowcaseCategory(candidate({
        code: "series-a",
        mechanic: "rating.authored.count",
        params: { seriesId: 1 },
      })),
      "rating.series",
    )
  })

  it("fills remaining slots beyond the per-category cap when thematic pool is narrow", () => {
    const selected = selectFeaturedShowcaseAchievements([
      candidate({
        code: "series-a",
        rarity: "legendary",
        mechanic: "rating.authored.count",
        params: { seriesId: 1 },
      }),
      candidate({
        code: "series-b",
        rarity: "epic",
        mechanic: "rating.authored.count",
        params: { seriesId: 2 },
      }),
      candidate({
        code: "series-c",
        rarity: "rare",
        mechanic: "rating.authored.count",
        params: { seriesId: 3 },
      }),
      candidate({
        code: "series-d",
        rarity: "common",
        mechanic: "rating.authored.count",
        params: { seriesId: 4 },
      }),
      candidate({
        code: "series-e",
        rarity: "common",
        mechanic: "rating.authored.count",
        params: { seriesId: 5 },
        awardedAt: "2026-03-01T00:00:00.000Z",
      }),
      candidate({
        code: "series-f",
        rarity: "common",
        mechanic: "rating.authored.count",
        params: { seriesId: 6 },
        awardedAt: "2026-02-01T00:00:00.000Z",
      }),
    ])

    assert.deepEqual(
      selected.map((item) => item.code),
      ["series-a", "series-b", "series-c", "series-e", "series-f"],
    )
    assert.equal(selected.length, 5)
  })

  it("ignores locked items and does not rank by showcase background", () => {
    const selected = selectFeaturedShowcaseAchievements([
      candidate({ code: "locked", awardedAt: null, rarity: "legendary" as AchievementRarity }),
      candidate({
        code: "earned",
        rarity: "common",
        mechanic: "bug-report.confirmed.count",
      }),
    ])

    assert.deepEqual(selected.map((item) => item.code), ["earned"])
  })
})
