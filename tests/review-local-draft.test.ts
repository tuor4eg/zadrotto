import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  clearReviewLocalDraft,
  getReviewLocalDraftKey,
  parseReviewDraftScope,
  parseReviewLocalDraft,
  readReviewLocalDraft,
  writeReviewLocalDraft,
} from "../src/lib/forms/review-local-draft"

describe("review local draft", () => {
  it("clears the local copy only after the successful action redirect", () => {
    const action = readFileSync("src/app/reviews/actions.ts", "utf8")
    const catalog = readFileSync("src/app/reviews/page.tsx", "utf8")
    const form = readFileSync("src/app/reviews/review-form.tsx", "utf8")

    assert.match(action, /redirect\(`\/reviews\?view=mine&\$\{toastParam\}=1&reviewDraft=\$\{reviewDraftScope\}`\)/)
    assert.match(catalog, /<ReviewLocalDraftCleanup authorId=\{currentAuthor\.id\} scope=\{reviewDraftScope\}/)
    assert.match(form, /window\.addEventListener\("pagehide", saveBeforeLeaving\)/)
    assert.doesNotMatch(form, /clearReviewLocalDraft/)
  })

  it("scopes drafts to the author and review", () => {
    assert.equal(getReviewLocalDraftKey(7, "new"), "zadrotto.review-draft:7:new")
    assert.equal(getReviewLocalDraftKey(7, "42"), "zadrotto.review-draft:7:42")
    assert.equal(parseReviewDraftScope("new"), "new")
    assert.equal(parseReviewDraftScope("42"), "42")
    assert.equal(parseReviewDraftScope("0"), null)
    assert.equal(parseReviewDraftScope("oops"), null)
    assert.equal(parseReviewDraftScope("new-12-3"), "new-12-3")
    assert.notEqual(getReviewLocalDraftKey(7, "new-12-3"), getReviewLocalDraftKey(7, "new-12-overall"))
  })

  it("accepts the current persisted shape and rejects malformed data", () => {
    assert.deepEqual(parseReviewLocalDraft({
      body: "Длинный текст рецензии",
      mediaItem: { id: 12, title: "Запись" },
      title: "Заголовок",
      updatedAt: "2026-09-21T12:00:00.000Z",
      version: 3,
      bodyFormat: "plain",
      partId: null,
    }), {
      body: "Длинный текст рецензии",
      mediaItem: { id: 12, title: "Запись" },
      title: "Заголовок",
      updatedAt: "2026-09-21T12:00:00.000Z",
      version: 3,
      bodyFormat: "plain",
      partId: null,
    })
    assert.equal(parseReviewLocalDraft({ version: 2 }), null)
    assert.equal(parseReviewLocalDraft({
      body: "Текст",
      mediaItem: { id: -1, title: "Запись" },
      title: "Заголовок",
      updatedAt: "2026-09-21T12:00:00.000Z",
      version: 1,
    }), null)
  })

  it("persists a recoverable draft and clears it only when requested", () => {
    const values = new Map<string, string>()
    const previousWindow = globalThis.window
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem(key: string) { return values.get(key) ?? null },
          removeItem(key: string) { values.delete(key) },
          setItem(key: string, value: string) { values.set(key, value) },
        },
      },
    })
    try {
      const key = getReviewLocalDraftKey(7, "new")
      writeReviewLocalDraft(key, {
        body: "Длинный текст рецензии",
        mediaItem: { id: 12, title: "Запись" },
        title: "Заголовок",
      })
      assert.equal(readReviewLocalDraft(key)?.body, "Длинный текст рецензии")
      clearReviewLocalDraft(key)
      assert.equal(readReviewLocalDraft(key), null)
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      })
    }
  })
})

describe("versioned Markdown drafts", () => {
  const base = { title: "Текст", body: "**Текст**", mediaItem: null, partId: null, updatedAt: "2026-11-17T00:00:00Z" }
  it("migrates old drafts as plain and validates v3 format", () => {
    for (const version of [1, 2]) {
      assert.equal(parseReviewLocalDraft({ ...base, version })?.bodyFormat, "plain")
      assert.equal(parseReviewLocalDraft({ ...base, version })?.version, 3)
    }
    assert.equal(parseReviewLocalDraft({ ...base, version: 3, bodyFormat: "markdown" })?.bodyFormat, "markdown")
    assert.equal(parseReviewLocalDraft({ ...base, version: 3, bodyFormat: "html" }), null)
    assert.equal(parseReviewLocalDraft({ ...base, version: 4, bodyFormat: "markdown" }), null)
  })
  it("does not overwrite a draft from a future version, including empty autosaves", () => {
    const future = JSON.stringify({ ...base, version: 4, bodyFormat: "markdown" })
    let stored: string | null = future
    const previousWindow = globalThis.window
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
      getItem() { return stored }, setItem(_key: string, value: string) { stored = value }, removeItem() { stored = null },
    } } })
    try {
      writeReviewLocalDraft("future", { title: "changed", body: "changed", mediaItem: null, bodyFormat: "markdown" })
      assert.equal(stored, future)
      writeReviewLocalDraft("future", { title: "", body: "", mediaItem: null })
      assert.equal(stored, future)
      clearReviewLocalDraft("future")
      assert.equal(stored, future)
    } finally { Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow }) }
  })
})
