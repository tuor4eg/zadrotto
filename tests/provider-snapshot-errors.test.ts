import assert from "node:assert/strict";
import { test } from "node:test";
import { describeBookSource, OpenLibraryWorkRedirectError } from "../src/lib/providers/book-adapters";
import { fetchBookSnapshot } from "../src/lib/providers/book-fetch";
import { snapshotItemError, snapshotItemErrorMessage } from "../src/lib/providers/snapshot-item-errors";
import { parseSnapshotJobPayload } from "../src/lib/providers/snapshot-job-payload";

test("Open Library merged works report a trusted target without replacing a usable snapshot or following it silently", async () => {
  let saved = false, requests = 0, budget = 0;
  await assert.rejects(fetchBookSnapshot(describeBookSource("open-library", "/works/OL893415W"), {
    beforeRequest: async () => { budget++; }, requestStartedAt: async () => new Date(),
    saveSnapshot: async row => { saved = true; return row; },
    fetchImpl: async () => { requests++; return Response.json({ key: "/works/OL893415W", type: { key: "/type/redirect" }, location: "/works/OL893414W" }); },
  }), (error: unknown) => {
    assert.ok(error instanceof OpenLibraryWorkRedirectError);
    const diagnostic = snapshotItemError(4, error);
    assert.deepEqual(diagnostic, { id: 4, code: "open-library-work-moved", targetExternalId: "/works/OL893414W" });
    assert.match(snapshotItemErrorMessage(diagnostic), /OL893414W/);
    return true;
  });
  assert.equal(saved, false); assert.equal(requests, 1); assert.equal(budget, 1);
});

test("redirect diagnostics reject external URLs, self redirects and malformed work IDs", async () => {
  for (const location of ["https://evil.example/works/OL2W", "/works/OL1W", "/authors/OL2A", "/works/OL0W"]) {
    await assert.rejects(fetchBookSnapshot(describeBookSource("open-library", "/works/OL1W"), {
      beforeRequest: async () => {}, requestStartedAt: async () => new Date(),
      saveSnapshot: async () => { throw new Error("MUST_NOT_SAVE"); },
      fetchImpl: async () => Response.json({ key: "/works/OL1W", type: { key: "/type/redirect" }, location }),
    }), /Invalid Open Library redirect/);
  }
});

test("checkpoint diagnostics retain actionable targets without persisting arbitrary exception messages", () => {
  const error = snapshotItemError(4, new Error("https://provider.invalid/?key=private-credential"));
  assert.deepEqual(error, { id: 4, code: "snapshot-operation-failed" });
  assert.doesNotMatch(snapshotItemErrorMessage(error), /private-credential/);
  const checkpoint = { afterId: 4, throughId: 10, processed: 0, failed: 1, errors: [{ id: 4, code: "open-library-work-moved", targetExternalId: "/works/OL2W" }] };
  assert.equal(parseSnapshotJobPayload({ operation: "refresh", checkpoint }).checkpoint!.errors[0].targetExternalId, "/works/OL2W");
  assert.throws(() => parseSnapshotJobPayload({ operation: "refresh", checkpoint: { ...checkpoint, errors: [{ ...checkpoint.errors[0], targetExternalId: "https://evil.example" }] } }));
});
