import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AchievementCard, type AchievementShowcaseItem } from "../src/components/achievements/achievement-card"
import { AuthorAchievementsCatalog } from "../src/components/achievements/author-achievements-catalog"
import { getAchievementHistoryLimit } from "../src/components/achievements/achievement-award-history"

function item(code: string): AchievementShowcaseItem {
  const awardedAt = new Date("2026-11-07T00:00:00Z")
  return {
    awardedAt, awardedLevels: Array.from({ length: 6 }, (_, index) => ({
      awardedAt, level: index + 1, name: `Уровень ${index + 1}`, description: "Описание",
      imageUrl: `/achievement-images/${code}-${index + 1}.webp`, rarity: "common", showcaseBackgroundImageUrl: null,
    })),
    awardedThreshold: 60, code, currentValue: 60, description: "Описание", highestAwardedLevel: 6,
    imageUrl: `/achievement-images/${code}-6.webp`, levelCount: 6, mechanic: "rating.authored.count",
    name: "Ачивка", nextLevel: null, nextThreshold: null, params: {}, progressAvailable: true,
    rarity: "common", showcaseBackgroundImageUrl: null,
  }
}

test("a six-level card mounts only the latest level while preserving the previous-level control", () => {
  const html = renderToStaticMarkup(createElement(AchievementCard, { item: item("one"), browseAwardedLevels: true }))
  assert.equal((html.match(/<img\b/g) ?? []).length, 1)
  assert.match(html, /one-6.webp/)
  assert.doesNotMatch(html, /one-1.webp/)
  assert.match(html, /Предыдущий уровень/)
  assert.doesNotMatch(html, /Следующий уровень/)
})

test("initial catalogue mounts one image per achievement and no history entries before measurement", () => {
  const html = renderToStaticMarkup(createElement(AuthorAchievementsCatalog, { items: Array.from({ length: 60 }, (_, index) => item(`award-${index}`)) }))
  assert.equal((html.match(/<img\b/g) ?? []).length, 60)
  assert.equal((html.match(/<li\b/g) ?? []).length, 0)
  assert.match(html, /Загружаем историю/)
  assert.ok(Buffer.byteLength(html) < 200 * 1024, "initial markup must not grow with hidden level panels")
})

test("history fits whole rows and never exceeds the available gallery height", () => {
  assert.equal(getAchievementHistoryLimit(480, 96), 3)
  assert.equal(getAchievementHistoryLimit(479, 96), 2)
  assert.equal(getAchievementHistoryLimit(96, 96), 0)
  assert.equal(getAchievementHistoryLimit(60, 96), 0)
  assert.equal(getAchievementHistoryLimit(1024, 96), 7)
})
