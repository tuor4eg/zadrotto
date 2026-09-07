import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  createEmptyDemoProfile,
  DEMO_LOGIN_PROMPT_RATING_THRESHOLD,
  DEMO_PROFILE_SCHEMA_VERSION,
  getDemoRatingsCount,
  parseDemoProfile,
  shouldShowDemoLoginPrompt,
} from "../src/lib/user-state/demo-profile"
import { claimNewlyEarnedDemoAchievements } from "../src/lib/user-state/demo-achievements"
import {
  shouldImportDemoRating,
  shouldImportDemoStatus,
} from "../src/lib/user-state/demo-selectors"
import { canUsePersonalArchiveActions, resolveUserStateMode } from "../src/lib/user-state/mode"
import {
  buildHomeResearchSnapshotFromDemo,
  getHomeResearchMessage,
} from "../src/lib/main-page/home-research-snapshot"

describe("demo profile foundation", () => {
  it("resets guest onboarding together with an imported demo profile", () => {
    const storageSource = readFileSync("src/lib/user-state/demo-storage.ts", "utf8")

    assert.match(storageSource, /getArchiveOnboardingStorageKey\(DEMO_ONBOARDING_STORAGE_AUTHOR_KEY\)/)
    assert.match(storageSource, /removeItem\([\s\S]*getArchiveOnboardingStorageKey/)
    assert.match(storageSource, /ARCHIVE_ONBOARDING_STORAGE_EVENT/)
    assert.match(
      storageSource,
      /export function ensureDemoProfile[\s\S]*if \(existing[^\n]*return existing[\s\S]*clearDemoProfile\(\)[\s\S]*createEmptyDemoProfile\(\)/,
    )
  })

  it("parses a valid profile and rejects unknown shapes", () => {
    const profile = createEmptyDemoProfile("2026-01-01T00:00:00.000Z")
    profile.ratings.alien = { score: 80, updatedAt: "2026-01-02T00:00:00.000Z" }
    profile.statuses.blade = { status: "wanted", updatedAt: "2026-01-02T00:00:00.000Z" }

    const parsed = parseDemoProfile(profile)
    assert.equal(parsed?.schemaVersion, DEMO_PROFILE_SCHEMA_VERSION)
    assert.equal(parsed?.ratings.alien?.score, 80)
    assert.equal(parsed?.statuses.blade?.status, "wanted")
    assert.equal(getDemoRatingsCount(parsed!), 1)
    assert.equal(parseDemoProfile(null), null)
    assert.equal(parseDemoProfile({ schemaVersion: "nope" }), null)
  })

  it("drops status entries that collide with ratings", () => {
    const parsed = parseDemoProfile({
      schemaVersion: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      ratings: { alien: { score: 70, updatedAt: "2026-01-02T00:00:00.000Z" } },
      statuses: { alien: { status: "wanted", updatedAt: "2026-01-02T00:00:00.000Z" } },
      interests: { mediaTypeOverrides: {} },
      loginPrompt: { dismissCount: 0, lastShownAt: null },
      import: { importedAt: null, importedToAuthorId: null },
    })

    assert.equal(parsed?.statuses.alien, undefined)
    assert.equal(parsed?.ratings.alien?.score, 70)
  })

  it("shows the login prompt after the threshold with exponential backoff", () => {
    const profile = createEmptyDemoProfile()
    for (let index = 0; index < DEMO_LOGIN_PROMPT_RATING_THRESHOLD; index += 1) {
      profile.ratings[`item-${index}`] = {
        score: 50,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }
    }

    assert.equal(shouldShowDemoLoginPrompt(profile, Date.parse("2026-01-01T00:00:00.000Z")), true)

    profile.loginPrompt.lastShownAt = "2026-01-01T00:00:00.000Z"
    profile.loginPrompt.dismissCount = 0
    assert.equal(shouldShowDemoLoginPrompt(profile, Date.parse("2026-01-01T12:00:00.000Z")), false)
    assert.equal(shouldShowDemoLoginPrompt(profile, Date.parse("2026-01-02T00:00:00.000Z")), true)

    profile.loginPrompt.dismissCount = 2
    profile.loginPrompt.lastShownAt = "2026-01-01T00:00:00.000Z"
    assert.equal(shouldShowDemoLoginPrompt(profile, Date.parse("2026-01-04T00:00:00.000Z")), false)
    assert.equal(shouldShowDemoLoginPrompt(profile, Date.parse("2026-01-05T00:00:00.000Z")), true)
  })

  it("resolves user modes and wires the home CTA", () => {
    assert.equal(resolveUserStateMode({ authenticated: true }), "authorized")
    assert.equal(canUsePersonalArchiveActions("demo"), true)
    assert.equal(canUsePersonalArchiveActions("plain"), false)

    const pageSource = readFileSync("src/app/page.tsx", "utf8")
    const buttonSource = readFileSync("src/components/user-state/start-demo-history-button.tsx", "utf8")
    assert.match(pageSource, /StartDemoHistoryButton/)
    assert.doesNotMatch(pageSource, /DemoLocalAchievements|DemoHomeStatistics/)
    assert.match(buttonSource, /ensureDemoProfile/)
    assert.match(buttonSource, /Продолжить историю/)
    assert.match(buttonSource, /ensureDemoProfile\(\)\s*\n\s*router\.push\("\/archive"\)/)
    assert.doesNotMatch(buttonSource, /alreadyStarted/)
  })

  it("keeps account data when deciding demo import slots", () => {
    assert.equal(shouldImportDemoRating(false), true)
    assert.equal(shouldImportDemoRating(true), false)
    assert.equal(shouldImportDemoStatus({
      hasDemoRating: false,
      hasServerRating: false,
      hasServerStatus: false,
    }), true)
    assert.equal(shouldImportDemoStatus({
      hasDemoRating: false,
      hasServerRating: false,
      hasServerStatus: true,
    }), false)
    assert.equal(shouldImportDemoStatus({
      hasDemoRating: true,
      hasServerRating: false,
      hasServerStatus: false,
    }), false)
  })

  it("does not treat a fake demo currentAuthor as a real login for ratings", () => {
    const formSource = readFileSync("src/app/author-rating-form.tsx", "utf8")
    const dialogSource = readFileSync("src/app/media-item-rating-dialog.tsx", "utf8")
    const catalogSource = readFileSync("src/app/media-items-catalog.tsx", "utf8")

    assert.match(formSource, /hasRealAuthor/)
    assert.match(formSource, /currentAuthor\.code !== "demo"/)
    assert.match(formSource, /action=\{isDemo \? undefined : formAction\}/)
    assert.match(dialogSource, /currentAuthor=\{hasRealAuthor \? currentAuthor : null\}/)
    assert.doesNotMatch(
      catalogSource,
      /currentAuthor=\{\s*currentAuthor \?\? \(isDemo \? \{ name: "Гость", code: "demo" \}/,
    )
  })

  it("drives the home intro from a source-agnostic research snapshot", () => {
    const profile = createEmptyDemoProfile("2026-01-01T00:00:00.000Z")
    profile.ratings.alien = { score: 80, updatedAt: "2026-01-02T00:00:00.000Z" }
    const snapshot = buildHomeResearchSnapshotFromDemo(profile)
    assert.equal(snapshot.ratingsCount, 1)
    assert.equal(snapshot.averageScore, 80)
    assert.equal(getHomeResearchMessage(snapshot).key, "early-progress")

    const pageSource = readFileSync("src/app/page.tsx", "utf8")
    assert.match(pageSource, /DemoHomeIntro/)
    assert.match(pageSource, /HomeIntroHero/)
    assert.match(pageSource, /buildHomeResearchSnapshotFromAuthor|getHomeResearchMessage/)
  })

  it("claims newly earned demo achievements for toasts at most once", () => {
    const catalog = [{
      code: "ratings",
      description: null,
      name: "Оценки",
      levels: [
        { description: null, imageUrl: null, level: 1, name: "Первая", threshold: 1 },
        { description: null, imageUrl: "/a.webp", level: 2, name: "Три", threshold: 3 },
      ],
    }, {
      code: "games",
      description: null,
      name: "Игры",
      levels: [
        { description: null, imageUrl: null, level: 1, name: "Десять игр", threshold: 10 },
      ],
    }]

    const seed = claimNewlyEarnedDemoAchievements({
      announcedKeys: [],
      catalog,
      seeded: false,
      valuesByCode: { ratings: 1, games: 0 },
    })
    assert.deepEqual(seed.newlyEarned, [])
    assert.deepEqual(seed.announcedKeys, ["ratings:1"])
    assert.equal(seed.seeded, true)

    const next = claimNewlyEarnedDemoAchievements({
      announcedKeys: seed.announcedKeys,
      catalog,
      seeded: true,
      valuesByCode: { ratings: 3, games: 10 },
    })
    assert.equal(next.newlyEarned.length, 2)
    assert.equal(next.newlyEarned[0]?.name, "Три")
    assert.equal(next.newlyEarned[1]?.name, "Десять игр")
    assert.deepEqual(next.announcedKeys, ["ratings:1", "ratings:2", "games:1"])

    const toastHost = readFileSync("src/components/achievements/achievement-toast-host.tsx", "utf8")
    assert.match(toastHost, /checkDemoAchievements/)
    assert.match(toastHost, /loadDemoAchievementState/)
    assert.match(toastHost, /valuesByCode: values/)
    assert.match(toastHost, /ARCHIVE_ONBOARDING_RATING_SAVED_EVENT/)

    const catalogQuery = readFileSync("src/db/queries/achievements.ts", "utf8")
    assert.match(catalogQuery, /getDemoRatingAchievementState/)
    assert.match(catalogQuery, /countRatingAuthoredForMediaCodes/)
    assert.doesNotMatch(catalogQuery, /Demo can only evaluate unfiltered/)

    const catalogSource = readFileSync("src/lib/achievements/catalog.ts", "utf8")
    assert.match(catalogSource, /countRatingAuthoredForMediaCodes/)
    assert.match(catalogSource, /mediaItems\.code} in \(\$\{codeList\}\)/)

    const routeSource = readFileSync("src/app/api/demo-achievements/route.ts", "utf8")
    assert.match(routeSource, /export async function POST/)
    assert.match(routeSource, /mediaItemCodes/)
  })
})
