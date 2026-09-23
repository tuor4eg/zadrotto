import assert from "node:assert/strict"
import test from "node:test"

import { findActiveMentionQuery } from "../src/components/inline-mentions/mention-textarea"

test("finds a multi-word mention at the caret in the middle of review text", () => {
  const value = "До @ведьмак 3 после"
  const caret = value.indexOf(" после")

  assert.deepEqual(findActiveMentionQuery(value, caret, caret), {
    start: 3,
    end: caret,
    trigger: "@",
    query: "ведьмак 3",
  })
})

test("does not activate mentions inside email-like text or existing markers", () => {
  const email = "mail@example.com"
  assert.equal(findActiveMentionQuery(email, email.length, email.length), null)

  const marker = "[[title:123|@ведьмак]]"
  const caret = marker.indexOf("ведьмак") + "ведьмак".length
  assert.equal(findActiveMentionQuery(marker, caret, caret), null)
})

test("requires a collapsed selection and stops at punctuation", () => {
  const value = "До @ведьмак, потом"
  assert.equal(findActiveMentionQuery(value, 3, 8), null)
  assert.equal(findActiveMentionQuery(value, value.length, value.length), null)
})
