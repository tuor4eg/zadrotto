import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeOptionalFranchiseString,
  parseRequiredFranchiseId,
} from "../src/lib/admin-franchise-form";

describe("admin franchise form helpers", () => {
  it("normalizes optional strings to null when empty", () => {
    assert.equal(normalizeOptionalFranchiseString("  "), null);
    assert.equal(normalizeOptionalFranchiseString("  Twin Peaks  "), "Twin Peaks");
  });

  it("parses required franchise ids as positive safe integers", () => {
    assert.deepEqual(parseRequiredFranchiseId("42"), { ok: true, value: 42 });
    assert.deepEqual(parseRequiredFranchiseId(" 7 "), { ok: true, value: 7 });
    assert.deepEqual(parseRequiredFranchiseId(""), { ok: false });
    assert.deepEqual(parseRequiredFranchiseId("0"), { ok: false });
    assert.deepEqual(parseRequiredFranchiseId("-1"), { ok: false });
    assert.deepEqual(parseRequiredFranchiseId("1.5"), { ok: false });
  });
});
