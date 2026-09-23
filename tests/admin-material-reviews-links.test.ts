import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const page = readFileSync(
  "src/app/admin/(protected)/materials/reviews/page.tsx",
  "utf8",
)

test("links published review titles to their public pages without linking unavailable reviews", () => {
  assert.match(page, /review\.status !== "published"[\s\S]*return <h3/)
  assert.match(page, /href=\{`\/reviews\/\$\{review\.id\}`\}/)
  assert.match(page, /<ReviewTitleLink[\s\S]*review=\{review\}/)
})
