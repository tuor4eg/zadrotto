import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const archiveFeedQuery = readFileSync("src/db/queries/archive-feed.ts", "utf8")

test("orders review feed entries by creation date rather than later edits", () => {
  const reviewQueryStart = archiveFeedQuery.indexOf("authorName: authors.name")
  const seriesQueryStart = archiveFeedQuery.indexOf("code: franchises.code", reviewQueryStart)
  const reviewQuery = archiveFeedQuery.slice(reviewQueryStart, seriesQueryStart)

  assert.match(reviewQuery, /createdAt: contributions\.createdAt/)
  assert.match(
    reviewQuery,
    /\.orderBy\(desc\(contributions\.createdAt\), desc\(contributions\.id\)\)/,
  )
  assert.doesNotMatch(reviewQuery, /contributions\.(?:reviewedAt|updatedAt)/)
})
