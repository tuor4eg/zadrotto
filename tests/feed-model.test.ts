import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFeedCursor, parseFeedCursor, getFeedNavigation, type FeedItem } from "../src/lib/feed/model";

test("feed cursors retain microseconds and reject malformed values", () => {
  const cursor = { at: "2026-11-07T06:05:04.123456Z", kind: 5, id: 42 };
  assert.deepEqual(parseFeedCursor(encodeFeedCursor(cursor)), cursor);
  for (const invalid of ["", "%%%", "x".repeat(300), ...[
    {}, [], { ...cursor, at: "0000-11-07T06:05:04.123456Z" }, { ...cursor, at: "2026-02-31T06:05:04.123456Z" }, { ...cursor, at: "2026-11-07T06:05:04.123Z" },
    { ...cursor, kind: 8 }, { ...cursor, kind: "5" }, { ...cursor, id: -1 }, { ...cursor, id: 1.5 }, { ...cursor, table: "ratings" },
  ].map(value => Buffer.from(JSON.stringify(value)).toString("base64url"))]) assert.equal(parseFeedCursor(invalid), null);
});

test("pagination has no newer link at the start and safely handles an emptied live page", () => {
  const item = { cursor: { at: "2026-11-07T06:05:04.123456Z", kind: 5, id: 42 } } as FeedItem;
  assert.deepEqual(getFeedNavigation([], undefined, false), { older: null, newer: null });
  assert.equal(getFeedNavigation([item], undefined, true).newer, null);
  assert.ok(getFeedNavigation([item], undefined, true).older);
  assert.ok(getFeedNavigation([item], { direction: "older", cursor: item.cursor }, true).older);
  assert.deepEqual(getFeedNavigation([item], undefined, true, true), { older: null, newer: encodeFeedCursor(item.cursor) });
  assert.deepEqual(getFeedNavigation([item], undefined, false, true), { older: null, newer: null });
  assert.deepEqual(getFeedNavigation([], undefined, false, true), { older: null, newer: null });
  assert.ok(getFeedNavigation([item], { direction: "older", cursor: item.cursor }, false).newer);
  assert.equal(getFeedNavigation([item], { direction: "newer", cursor: item.cursor }, false).newer, null);
});
