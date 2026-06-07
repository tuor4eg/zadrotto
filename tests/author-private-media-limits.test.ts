import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkAuthorPrivateMediaLimit,
  getPrivateMediaLimitWindowStart,
} from "../src/lib/authors/private-media-limits";

describe("author private media limits", () => {
  it("allows creation when no limits are set", () => {
    assert.deepEqual(
      checkAuthorPrivateMediaLimit({
        limits: { maxDraftMediaItems: null, maxDraftMediaItemsPerDay: null },
        usage: { totalCount: 100, recentCount: 10 },
      }),
      { ok: true },
    );
  });

  it("blocks when the total private media limit is reached", () => {
    assert.deepEqual(
      checkAuthorPrivateMediaLimit({
        limits: { maxDraftMediaItems: 3, maxDraftMediaItemsPerDay: null },
        usage: { totalCount: 3, recentCount: 0 },
      }),
      { ok: false, reason: "total-limit" },
    );
  });

  it("blocks when the daily private media limit is reached", () => {
    assert.deepEqual(
      checkAuthorPrivateMediaLimit({
        limits: { maxDraftMediaItems: null, maxDraftMediaItemsPerDay: 2 },
        usage: { totalCount: 2, recentCount: 2 },
      }),
      { ok: false, reason: "daily-limit" },
    );
  });

  it("allows creation while usage is below both limits", () => {
    assert.deepEqual(
      checkAuthorPrivateMediaLimit({
        limits: { maxDraftMediaItems: 3, maxDraftMediaItemsPerDay: 2 },
        usage: { totalCount: 2, recentCount: 1 },
      }),
      { ok: true },
    );
  });

  it("builds a rolling 24 hour window start", () => {
    assert.equal(
      getPrivateMediaLimitWindowStart(new Date("2026-05-24T12:00:00.000Z")).toISOString(),
      "2026-05-23T12:00:00.000Z",
    );
  });
});
