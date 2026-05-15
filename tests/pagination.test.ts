import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parsePage, parsePageSize } from "@/lib/pagination";

describe("parsePage", () => {
  it("keeps positive safe integer pages and falls back to first page", () => {
    assert.equal(parsePage("3"), 3);
    assert.equal(parsePage("0"), 1);
    assert.equal(parsePage("-1"), 1);
    assert.equal(parsePage("1.5"), 1);
    assert.equal(parsePage("abc"), 1);
  });
});

describe("parsePageSize", () => {
  const allowedPageSizes = [24, 48, 72, 96] as const;

  it("keeps allowed page sizes", () => {
    assert.equal(parsePageSize("24", allowedPageSizes, 48), 24);
    assert.equal(parsePageSize("96", allowedPageSizes, 48), 96);
  });

  it("falls back to the default page size for unsupported values", () => {
    assert.equal(parsePageSize(undefined, allowedPageSizes, 48), 48);
    assert.equal(parsePageSize("50", allowedPageSizes, 48), 48);
    assert.equal(parsePageSize("abc", allowedPageSizes, 48), 48);
  });
});
