import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  filterAchievementsByStatus,
  getAchievementShowcaseStats,
  getNearestAchievementGoal,
  sortAchievementsByAwardedAt,
} from "@/lib/achievements/showcase"

const page = readFileSync("src/app/achievements/page.tsx", "utf8")
const publicProfilePage = readFileSync("src/app/users/[id]/achievements/page.tsx", "utf8")
const stats = readFileSync(
  "src/components/achievements/author-achievement-hero-stats.tsx",
  "utf8",
)
const gallery = readFileSync(
  "src/components/achievements/author-achievement-gallery.tsx",
  "utf8",
)
const query = readFileSync("src/db/queries/achievements.ts", "utf8")
const header = readFileSync("src/components/archive/public-site-header.tsx", "utf8")
const toast = readFileSync("src/components/achievements/achievement-toast-host.tsx", "utf8")
const homePage = readFileSync("src/app/page.tsx", "utf8")

describe("public achievements page", () => {
  it("is a public-shell page for signed-in authors and demo guests", () => {
    assert.match(page, /<PublicSiteHeader \{\.\.\.headerState\.headerProps\} \/>/)
    assert.match(page, /getPublicSiteHeaderState/)
    assert.match(page, /max-w-\[1480px\][^"\n]*flex-col gap-3/)
    assert.match(page, /DemoAchievementsPage/)
    assert.doesNotMatch(page, /if \(!author\) \{\s*redirect\("\/"\)/)
    assert.match(header, /showAchievements[\s\S]*href: "\/achievements"[\s\S]*label: "Ачивки"/)
    assert.match(header, /isDemo/)
  })

  it("stretches the public profile achievement paper to the footer", () => {
    assert.match(publicProfilePage, /archive-page flex min-h-0 flex-1 flex-col/)
    assert.match(publicProfilePage, /max-w-\[1480px\] flex-1 flex-col gap-3/)
    assert.match(publicProfilePage, /archive-paper archive-panel flex-1 p-4/)
  })

  it("renders the hero copy and main-page-like stats", () => {
    assert.match(page, />\s*Твои ачивки\s*</)
    assert.match(page, />\s*Маленькие победы\. Большая история\s*</)
    assert.match(page, /<AuthorAchievementHeroStats/)
    assert.match(page, /backgroundImage: "url\('\/mascot\/deadz_achieves\.webp'\)"/)
    assert.match(page, /archive-panel overflow-hidden px-6 py-6/)
    assert.match(page, /position: "absolute"/)
    assert.match(page, /zIndex: 0/)
    assert.doesNotMatch(page, /max-w-\[68%\]/)
    assert.doesNotMatch(page, /max-w-\[58%\]/)
    assert.match(page, /maskImage: "linear-gradient\(to right, transparent, black 18%\)"/)
    assert.doesNotMatch(page, /getNearestAchievementGoal\(items\)/)
    assert.doesNotMatch(page, /nearestGoal=\{nearestGoal\}/)
    assert.match(stats, /Получено/)
    assert.match(stats, /Завершено/)
    assert.match(stats, /В процессе/)
    assert.doesNotMatch(stats, /Ближайшая цель/)
    assert.match(stats, /icon: Trophy/)
    assert.match(stats, /icon: BadgeCheck/)
    assert.match(stats, /icon: ChartColumnIncreasing/)
    assert.doesNotMatch(stats, /icon: Target/)
    assert.doesNotMatch(stats, /function NearestAchievementGoal/)
    assert.doesNotMatch(stats, /LockKeyhole|goal\.isAwarded|role="progressbar"/)
    assert.match(stats, /flex flex-wrap items-end gap-8 sm:flex-nowrap/)
    assert.match(stats, /dl className="contents"/)
    assert.doesNotMatch(stats, /mt-6/)
    assert.doesNotMatch(stats, /bg-amber-50/)
    assert.match(stats, /font-serif text-3xl/)
    assert.match(stats, /font-mono text-\[9px\] uppercase/)
  })

  it("loads the showcase once and derives hero stats from the same items", () => {
    assert.match(page, /getAchievementShowcase\(author\.id\)/)
    assert.match(page, /getAchievementShowcaseStats\(items\)/)
    assert.doesNotMatch(page, /getAuthorAchievementStats/)
    assert.doesNotMatch(query, /export async function getAuthorAchievementStats/)
  })

  it("counts awarded, completed, and still-open achievements from showcase items", () => {
    const items = [
      { awardedAt: new Date("2026-01-01"), currentValue: 12, nextLevel: 2 },
      { awardedAt: new Date("2026-01-02"), currentValue: 20, nextLevel: null },
      { awardedAt: null, currentValue: 0, nextLevel: 1 },
      { awardedAt: null, currentValue: 4, nextLevel: 1 },
    ]

    assert.deepEqual(getAchievementShowcaseStats(items), {
      completedCount: 1,
      earnedCount: 2,
      inProgressCount: 2,
    })
    assert.equal(filterAchievementsByStatus(items, "all").length, 4)
    assert.equal(filterAchievementsByStatus(items, "earned").length, 2)
    assert.equal(filterAchievementsByStatus(items, "completed").length, 1)
    assert.equal(filterAchievementsByStatus(items, "in-progress").length, 2)
    assert.equal(filterAchievementsByStatus(items, "locked").length, 2)
    assert.deepEqual(
      sortAchievementsByAwardedAt(items).map((item) => item.currentValue),
      [20, 12, 0, 4],
    )
  })

  it("picks the nearest remaining threshold as the hero goal", () => {
    const items = [
      {
        awardedAt: new Date("2026-01-01"),
        currentValue: 12,
        description: "Оценить сериалы",
        imageUrl: "/series.webp",
        name: "Серии",
        nextThreshold: 20,
      },
      {
        awardedAt: new Date("2026-01-02"),
        currentValue: 20,
        description: null,
        imageUrl: "/done.webp",
        name: "Готово",
        nextThreshold: null,
      },
      {
        awardedAt: null,
        currentValue: 0,
        description: "Один шаг",
        imageUrl: "/locked.webp",
        name: "Один",
        nextThreshold: 1,
      },
      {
        awardedAt: null,
        currentValue: 0,
        description: "Оценить фильмы",
        imageUrl: "/locked.webp",
        name: "Фильмы",
        nextThreshold: 10,
      },
      {
        awardedAt: null,
        currentValue: 8,
        description: "Оценить игры",
        imageUrl: "/locked.webp",
        name: "Игры",
        nextThreshold: 10,
      },
      {
        awardedAt: new Date("2026-01-03"),
        currentValue: 15,
        description: null,
        imageUrl: "/edge.webp",
        name: "Уже на пороге",
        nextThreshold: 15,
      },
    ]

    assert.deepEqual(getNearestAchievementGoal(items), {
      currentValue: 8,
      description: "Оценить игры",
      imageUrl: "/locked.webp",
      isAwarded: false,
      name: "Игры",
      nextThreshold: 10,
    })
    assert.deepEqual(
      getNearestAchievementGoal([{
        awardedAt: null,
        currentValue: 2,
        description: "Без плейсхолдера",
        imageUrl: null,
        name: "Закрытая",
        nextThreshold: 10,
      }]),
      {
        currentValue: 2,
        description: "Без плейсхолдера",
        imageUrl: null,
        isAwarded: false,
        name: "Закрытая",
        nextThreshold: 10,
      },
    )
    assert.deepEqual(
      getNearestAchievementGoal([{
        awardedAt: new Date("2026-01-04"),
        currentValue: 9,
        description: "Почти готова",
        imageUrl: "/own.webp",
        name: "Почти",
        nextThreshold: 10,
      }, {
        awardedAt: null,
        currentValue: 0,
        description: "Оценить фильмы",
        imageUrl: "/locked.webp",
        name: "Фильмы",
        nextThreshold: 10,
      }]),
      {
        currentValue: 9,
        description: "Почти готова",
        imageUrl: "/own.webp",
        isAwarded: true,
        name: "Почти",
        nextThreshold: 10,
      },
    )
    assert.deepEqual(
      getNearestAchievementGoal([{
        awardedAt: new Date("2026-01-05"),
        currentValue: 3,
        description: null,
        imageUrl: null,
        name: "Без картинки",
        nextThreshold: 10,
      }]),
      {
        currentValue: 3,
        description: null,
        imageUrl: null,
        isAwarded: true,
        name: "Без картинки",
        nextThreshold: 10,
      },
    )
    assert.equal(
      getNearestAchievementGoal([{
        awardedAt: new Date("2026-01-01"),
        currentValue: 5,
        description: null,
        imageUrl: "/done.webp",
        name: "Готово",
        nextThreshold: null,
      }]),
      null,
    )
    assert.equal(
      getNearestAchievementGoal([{
        awardedAt: null,
        currentValue: 0,
        description: null,
        imageUrl: null,
        name: "Один",
        nextThreshold: 1,
      }]),
      null,
    )
  })

  it("renders a status gallery without a sort selector or media-type chips", () => {
    assert.match(page, /<AuthorAchievementGallery items=\{items\} \/>/)
    assert.match(gallery, /label: "Все"/)
    assert.match(gallery, /label: "Полученные"/)
    assert.match(gallery, /label: "Завершено"/)
    assert.match(gallery, /label: "В процессе"/)
    assert.match(gallery, /label: "Неоткрытые"/)
    assert.doesNotMatch(gallery, /Сначала редкие/)
    assert.doesNotMatch(gallery, /Все темы/)
    assert.doesNotMatch(gallery, /mediaType/)
    assert.doesNotMatch(gallery, /ArchiveSelect/)
    assert.match(gallery, /sortAchievementsByAwardedAt\(filterAchievementsByStatus\(items, filter\)\)/)
    assert.match(gallery, /xl:grid-cols-6/)
  })

  it("opens achievement links on the public gallery", () => {
    assert.match(toast, /href: "\/achievements"/)
    assert.match(homePage, /href="\/achievements"/)
  })
})
