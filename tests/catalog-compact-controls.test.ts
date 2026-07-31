import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("src/app/catalog-header-controls.tsx", "utf8");

describe("compact desktop catalog controls", () => {
  it("keeps filter and sort popovers visible outside the collapsed header", () => {
    assert.match(source, /lg:overflow-visible/);
    assert.doesNotMatch(source, /lg:overflow-hidden/);
  });
});
