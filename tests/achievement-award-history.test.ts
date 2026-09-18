import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { listAchievementHistoryEntries } from "@/lib/achievements/showcase"

const history = readFileSync("src/components/achievements/achievement-award-history.tsx", "utf8")
const catalog = readFileSync("src/components/achievements/author-achievements-catalog.tsx", "utf8")

describe("achievement award history", () => {
  it("lists awarded levels newest first", () => {
    const entries = listAchievementHistoryEntries([
      {
        code: "a",
        levelCount: 2,
        awardedLevels: [
          {
            awardedAt: "2025-01-01T00:00:00.000Z",
            description: "Первый",
            imageUrl: "/a1.webp",
            level: 1,
            name: "А",
          },
          {
            awardedAt: "2025-06-01T00:00:00.000Z",
            description: "Второй",
            imageUrl: "/a2.webp",
            level: 2,
            name: "А",
          },
        ],
      },
      {
        code: "b",
        levelCount: 1,
        awardedLevels: [
          {
            awardedAt: "2025-03-01T00:00:00.000Z",
            description: null,
            imageUrl: null,
            level: 1,
            name: "Б",
          },
        ],
      },
    ])

    assert.deepEqual(entries.map((entry) => entry.key), ["a:2", "b:1", "a:1"])
  })

  it("orders same-day levels of one achievement by level descending", () => {
    const entries = listAchievementHistoryEntries([
      {
        code: "dragons",
        levelCount: 2,
        awardedLevels: [
          {
            awardedAt: "2026-09-17T12:00:00.000Z",
            description: "Оценено 10 произведений о драконах",
            imageUrl: "/d1.webp",
            level: 1,
            name: "Амбициозное яйцо",
          },
          {
            awardedAt: "2026-09-17T08:00:00.000Z",
            description: "Оценено 25 произведений о драконах",
            imageUrl: "/d2.webp",
            level: 2,
            name: "Юный Смауг",
          },
        ],
      },
    ])

    assert.deepEqual(entries.map((entry) => entry.key), ["dragons:2", "dragons:1"])
  })

  it("renders a timeline widget with hidden scrollbar beside the gallery", () => {
    assert.match(history, /История достижений/)
    assert.match(history, /History className="size-5 shrink-0 text-amber-700"/)
    assert.match(history, /listAchievementHistoryEntries/)
    assert.match(history, /scrollbar-width:none/)
    assert.match(history, /border-l border-stone-400/)
    assert.match(history, /formatAchievementHistoryDate/)
    assert.match(history, /overflow-hidden/)
    assert.match(history, /h-full max-h-\[28rem\]/)
    assert.match(catalog, /AuthorAchievementGallery/)
    assert.match(catalog, /AchievementAwardHistory/)
    assert.match(catalog, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(17rem,24rem\)\]/)
    assert.match(catalog, /lg:h-0 lg:min-h-full/)
  })
})
