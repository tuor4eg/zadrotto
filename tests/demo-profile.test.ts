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
  clearDemoProfileIfSnapshot,
  writeDemoProfile,
} from "../src/lib/user-state/demo-storage"
import { presentDemoImportResult } from "../src/lib/user-state/demo-import-result"
import {
  buildHomeResearchSnapshotFromDemo,
  getHomeResearchMessage,
} from "../src/lib/main-page/home-research-snapshot"

describe("demo profile foundation", () => {
  it("imports demo history atomically in batches with account state winning conflicts", () => {
    const actionSource = readFileSync("src/app/demo-profile/actions.ts", "utf8")
    const importSource = readFileSync("src/db/operations/demo-profile-import.ts", "utf8")

    assert.match(actionSource, /await importDemoProfile\(\{/)
    assert.match(actionSource, /catch \(error\)[\s\S]*Failed to import demo profile[\s\S]*ratingsCount/)
    assert.match(importSource, /runInDomainEventTransaction/)
    assert.match(importSource, /pg_advisory_xact_lock/)
    assert.match(importSource, /unnest\(array\[\$\{sql\.join\(itemIds\.map/)
    assert.doesNotMatch(importSource, /unnest\(\$\{itemIds\}::integer\[\]\)/)
    assert.match(importSource, /existingRatings[\s\S]*existingStatuses[\s\S]*const occupied = new Set/)
    assert.match(importSource, /insert\(ratings\)[\s\S]*onConflictDoNothing/)
    assert.match(importSource, /insert\(authorMediaExperiences\)[\s\S]*onConflictDoNothing/)
    assert.match(importSource, /insert\(authorMediaStatuses\)[\s\S]*onConflictDoNothing/)
    assert.match(importSource, /appendEvents\(insertedRatings\.map[\s\S]*type: "rating\.created"/)
    assert.doesNotMatch(actionSource, /for \(const \[code|getAuthorRating|setAuthorMediaStatus|upsertAuthorRating/)
  })

  it("retries a temporary import failure with bounded delays and clears only after success", () => {
    const bridgeSource = readFileSync("src/components/user-state/demo-profile-import-bridge.tsx", "utf8")
    assert.match(bridgeSource, /IMPORT_RETRY_DELAYS_MS = \[1_000, 3_000\]/)
    assert.match(bridgeSource, /if \(result\.ok\)[\s\S]*clearDemoProfileIfSnapshot\(snapshot\)[\s\S]*lastAuthorRef\.current = authorId/)
    assert.match(bridgeSource, /setTimeout\(\(\) => void importWithRetry\(attempt \+ 1\), delay\)/)
    assert.match(bridgeSource, /text: result\.error/)
    assert.match(bridgeSource, /IMPORT_LONG_RETRY_MAX_MS = 15 \* 60_000/)
    assert.match(bridgeSource, /clearDemoProfileIfSnapshot\(snapshot\)/)
    assert.match(bridgeSource, /setTimeout\(\(\) => void importWithRetry\(0\)/)
    assert.doesNotMatch(bridgeSource, /lastAuthorRef\.current = authorId\s*\n\s*const profile/)
  })

  it("reports the import result and preserves recoverable local history", () => {
    const bridgeSource = readFileSync("src/components/user-state/demo-profile-import-bridge.tsx", "utf8")

    assert.match(bridgeSource, /<Suspense fallback=\{null\}>[\s\S]*<ArchiveToasts/)
    assert.match(bridgeSource, /if \(result\.ok\)[\s\S]*router\.refresh\(\)/)
    assert.deepEqual(presentDemoImportResult({
      importedRatings: 0,
      importedStatuses: 0,
      skippedConflicts: 0,
      skippedUnavailable: 2,
    }), {
      clearLocalProfile: false,
      text: "Не удалось перенести: 2. Локальная история сохранена.",
      tone: "error",
    })

    assert.deepEqual(presentDemoImportResult({
      importedRatings: 2,
      importedStatuses: 1,
      skippedConflicts: 1,
      skippedUnavailable: 0,
    }), {
      clearLocalProfile: true,
      text: "История перенесена в профиль: 3. Уже сохранено в аккаунте: 1.",
      tone: "success",
    })
  })

  it("does not clear a newer cross-tab profile after an older snapshot imports", () => {
    const values = new Map<string, string>()
    const previousWindow = globalThis.window
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        dispatchEvent() { return true },
        localStorage: {
          getItem(key: string) { return values.get(key) ?? null },
          removeItem(key: string) { values.delete(key) },
          setItem(key: string, value: string) { values.set(key, value) },
        },
      },
    })
    try {
      const oldProfile = createEmptyDemoProfile("2026-01-01T00:00:00.000Z")
      writeDemoProfile(oldProfile)
      const oldSnapshot = JSON.stringify(oldProfile)
      const newerProfile = structuredClone(oldProfile)
      newerProfile.ratings.alien = { score: 80, updatedAt: "2026-01-02T00:00:00.000Z" }
      writeDemoProfile(newerProfile)
      assert.equal(clearDemoProfileIfSnapshot(oldSnapshot), false)
      assert.ok(values.size > 0)
      assert.equal(clearDemoProfileIfSnapshot(JSON.stringify(newerProfile)), true)
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow })
    }
  })

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
    assert.equal(parseDemoProfile({ schemaVersion: 2 }), null)
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

  it("drops malformed experience without dropping its valid rating", () => {
    const profile = createEmptyDemoProfile("2026-01-01T00:00:00.000Z")
    profile.ratings.alien = {
      score: 80,
      updatedAt: "2026-01-02T00:00:00.000Z",
      experience: { experiencedAt: "2026-02-31", precision: "day" },
    }
    const parsed = parseDemoProfile(profile)
    assert.equal(parsed?.ratings.alien?.score, 80)
    assert.equal(parsed?.ratings.alien?.experience, undefined)

    profile.ratings.alien!.experience = { experiencedAt: "2020-05-01", precision: "month" }
    assert.deepEqual(parseDemoProfile(profile)?.ratings.alien?.experience, {
      experiencedAt: "2020-05-01",
      precision: "month",
    })
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
      mechanic: "rating.authored.count",
      name: "Оценки",
      params: {},
      levels: [
        {
          description: null,
          imageUrl: null,
          level: 1,
          name: "Первая",
          rarity: "common" as const,
          showcaseBackgroundImageUrl: null,
          threshold: 1,
        },
        {
          description: null,
          imageUrl: "/a.webp",
          level: 2,
          name: "Три",
          rarity: "common" as const,
          showcaseBackgroundImageUrl: null,
          threshold: 3,
        },
      ],
    }, {
      code: "games",
      description: null,
      mechanic: "rating.authored.count",
      name: "Игры",
      params: { mediaType: "game" },
      levels: [
        {
          description: null,
          imageUrl: null,
          level: 1,
          name: "Десять игр",
          rarity: "common" as const,
          showcaseBackgroundImageUrl: null,
          threshold: 10,
        },
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
