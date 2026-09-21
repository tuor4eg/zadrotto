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
  })

  it("accepts the current persisted shape and rejects malformed data", () => {
    assert.deepEqual(parseReviewLocalDraft({
      body: "Длинный текст рецензии",
      mediaItem: { id: 12, title: "Запись" },
      title: "Заголовок",
      updatedAt: "2026-09-21T12:00:00.000Z",
      version: 1,
    }), {
      body: "Длинный текст рецензии",
      mediaItem: { id: 12, title: "Запись" },
      title: "Заголовок",
      updatedAt: "2026-09-21T12:00:00.000Z",
      version: 1,
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
