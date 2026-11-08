import assert from "node:assert/strict"
import { test } from "node:test"
import { createEmptyDemoProfile, parseDemoProfile, DEMO_PROFILE_STORAGE_KEY } from "../src/lib/user-state/demo-profile"
import { getDemoProfileSnapshot, migrateStoredDemoProfile, readDemoProfile, subscribeDemoProfile } from "../src/lib/user-state/demo-storage"
import { setDemoStatus } from "../src/lib/user-state/demo-actions"

const updatedAt = "2026-11-07T00:00:00Z"
function legacy(version: number) {
  return { ...createEmptyDemoProfile(updatedAt), schemaVersion: version,
    ratings: { rated: { score: 80, updatedAt, experience: { experiencedAt: "2020-01-01", precision: "year" } } },
    partRatings: { series: { "1": { score: 70, updatedAt } } },
    statuses: { removed: { status: "skipped", updatedAt }, saved: { status: "wanted", updatedAt } },
    interests: { mediaTypeOverrides: { game: false } },
    loginPrompt: { dismissCount: 2, lastShownAt: updatedAt },
    import: { importedAt: null, importedToAuthorId: null } }
}

test("v1/v2 profiles lose only retired statuses and preserve supported history", () => {
  for (const version of [1, 2]) {
    const original = legacy(version)
    const parsed = parseDemoProfile(original)!
    assert.equal(parsed.schemaVersion, 3)
    assert.deepEqual(Object.keys(parsed.statuses), ["saved"])
    assert.deepEqual(parsed.ratings, original.ratings)
    assert.deepEqual(parsed.partRatings, version === 2 ? original.partRatings : {})
    assert.deepEqual(parsed.interests, original.interests)
    assert.deepEqual(parsed.loginPrompt, original.loginPrompt)
    assert.deepEqual(parsed.import, original.import)
    assert.deepEqual(parseDemoProfile(parsed), parsed, "migration and repeat import are idempotent")
  }
  assert.equal(parseDemoProfile(legacy(4)), null)
  assert.deepEqual(parseDemoProfile(legacy(3))?.statuses, { saved: { status: "wanted", updatedAt } })
})

test("storage migration is outside snapshot reads, handles cross-tab legacy updates and preserves unknown data", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const events = new EventTarget()
  let stored: string | null = JSON.stringify(legacy(2))
  let writes = 0
  let rejectWrites = false
  const fakeWindow = Object.assign(events, { localStorage: {
    getItem: () => stored,
    setItem: (_key: string, value: string) => { if (rejectWrites) throw new Error("blocked"); writes++; stored = value },
  } })
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow })
  let unsubscribe: (() => void) | undefined
  try {
    const snapshot = getDemoProfileSnapshot()
    assert.equal(writes, 0)
    assert.equal(JSON.parse(snapshot).schemaVersion, 3)
    let changes = 0
    unsubscribe = subscribeDemoProfile(() => changes++)
    migrateStoredDemoProfile()
    assert.equal(writes, 1)
    assert.deepEqual(Object.keys(JSON.parse(stored!).statuses), ["saved"])
    assert.ok(changes > 0)
    migrateStoredDemoProfile()
    assert.equal(writes, 1)
    stored = JSON.stringify(legacy(1))
    fakeWindow.dispatchEvent(new Event("storage"))
    assert.equal(JSON.parse(stored!).schemaVersion, 3)
    assert.equal(writes, 2)
    stored = JSON.stringify(legacy(4))
    const unknown = stored
    migrateStoredDemoProfile()
    assert.equal(stored, unknown)
    assert.equal(writes, 2)
    stored = "invalid json"
    assert.doesNotThrow(migrateStoredDemoProfile)
    assert.equal(stored, "invalid json")
    stored = JSON.stringify(legacy(2))
    rejectWrites = true
    assert.doesNotThrow(migrateStoredDemoProfile)
    assert.equal(readDemoProfile()?.schemaVersion, 3)
    assert.equal(JSON.parse(stored).schemaVersion, 2)
    rejectWrites = false
    assert.throws(() => setDemoStatus("removed", "skipped" as never), /Неизвестный статус/)
    setDemoStatus("new-wanted", "wanted")
    assert.equal(readDemoProfile()?.statuses["new-wanted"].status, "wanted")
    assert.equal(readDemoProfile()?.statuses.removed, undefined)
    assert.equal(DEMO_PROFILE_STORAGE_KEY, "zadrotto.demo-profile")
    fakeWindow.localStorage.getItem = () => { throw new Error("storage unavailable") }
    assert.doesNotThrow(migrateStoredDemoProfile)
    assert.equal(readDemoProfile(), null)
  } finally {
    unsubscribe?.()
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow)
    else Reflect.deleteProperty(globalThis, "window")
  }
})
