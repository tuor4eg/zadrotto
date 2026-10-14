import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { createEmptyDemoProfile, getDemoEffectiveScore, getDemoRatedCodes, getDemoRatingsCount, parseDemoProfile } from "../src/lib/user-state/demo-profile"
import { upsertDemoPartRating, deleteDemoPartRating, setDemoStatus } from "../src/lib/user-state/demo-actions"
import { readDemoProfile, writeDemoProfile } from "../src/lib/user-state/demo-storage"
import { matchDemoAuthorRatingFilter, shouldImportDemoRating, shouldImportDemoStatus } from "../src/lib/user-state/demo-selectors"
import { buildDemoHomeStatistics } from "../src/lib/user-state/demo-home-statistics"

const entry = (score: number) => ({ score, updatedAt: "2026-10-12T00:00:00.000Z" })

describe("demo part ratings", () => {
  it("migrates v1 and rejects future versions", () => {
    const old = { ...createEmptyDemoProfile(), schemaVersion: 1, ratings: { alien: entry(80) } }
    assert.deepEqual(parseDemoProfile(old)?.partRatings, {})
    assert.equal(parseDemoProfile(old)?.ratings.alien.score, 80)
    assert.equal(parseDemoProfile({ ...old, schemaVersion: 3 }), null)
  })

  it("filters malformed scopes and strips experience from parts", () => {
    const profile = createEmptyDemoProfile()
    const parsed = parseDemoProfile({ ...profile, partRatings: {
      series: { "1": { ...entry(70), experience: { experiencedAt: "2020-01-01", precision: "year" } }, "0": entry(50), bad: entry(60), "2": entry(71) },
    }, statuses: { series: { status: "wanted", updatedAt: "today" } } })!
    assert.deepEqual(parsed.partRatings.series, { "1": entry(70) })
    assert.equal(parsed.statuses.series, undefined)
  })

  it("counts a record once and calculates fallback without storing an overall rating", () => {
    const profile = createEmptyDemoProfile()
    profile.partRatings.series = { "1": entry(80), "2": entry(70), "3": entry(70) }
    assert.equal(getDemoRatingsCount(profile), 1)
    assert.deepEqual(getDemoRatedCodes(profile), ["series"])
    assert.equal(getDemoEffectiveScore(profile, "series"), 220 / 3)
    assert.equal(profile.ratings.series, undefined)
    assert.equal(matchDemoAuthorRatingFilter("series", "rated", profile), true)
    const stats = buildDemoHomeStatistics(profile, [{ code: "series", mediaType: "series", releaseYear: 2005 }])
    assert.deepEqual(stats.scoreDistribution, [{ score: 70, ratingsCount: 1 }])
    profile.ratings.series = entry(90)
    assert.equal(getDemoRatingsCount(profile), 1)
    assert.equal(getDemoEffectiveScore(profile, "series"), 90)
    delete profile.ratings.series
    assert.equal(getDemoEffectiveScore(profile, "series"), 220 / 3)
  })

  it("account scope and record status take priority over imported demo data", () => {
    assert.equal(shouldImportDemoRating(false, false), true)
    assert.equal(shouldImportDemoRating(true, false), false)
    assert.equal(shouldImportDemoRating(false, true), false)
    assert.equal(shouldImportDemoStatus({ hasDemoRating: false, hasServerRating: true, hasServerStatus: false }), false)
  })

  it("retains the clicked submitter when the demo form reads save/delete intent", () => {
    const source = readFileSync("src/app/author-rating-form.tsx", "utf8")
    assert.match(source, /new FormData\(event\.currentTarget,\s*\(event\.nativeEvent as SubmitEvent\)\.submitter\)/)
  })

  it("part actions remove statuses and delete only their selected scope", () => {
    const values = new Map<string, string>()
    const previousWindow = globalThis.window
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      dispatchEvent() { return true }, localStorage: {
        getItem(key: string) { return values.get(key) ?? null },
        removeItem(key: string) { values.delete(key) },
        setItem(key: string, value: string) { values.set(key, value) },
      },
    } })
    try {
      writeDemoProfile(createEmptyDemoProfile())
      setDemoStatus("series", "wanted")
      upsertDemoPartRating("series", 1, 80)
      upsertDemoPartRating("series", 2, 70)
      assert.equal(readDemoProfile()?.statuses.series, undefined)
      assert.throws(() => setDemoStatus("series", "skipped"))
      deleteDemoPartRating("series", 1)
      assert.equal(readDemoProfile()?.partRatings.series[2].score, 70)
      deleteDemoPartRating("series", 2)
      assert.equal(getDemoRatingsCount(readDemoProfile()!), 0)
      setDemoStatus("series", "wanted")
      assert.throws(() => upsertDemoPartRating("series", 0, 80))
      assert.throws(() => upsertDemoPartRating("series", 2, 75))
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow })
    }
  })
})
