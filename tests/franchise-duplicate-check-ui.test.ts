import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("src/components/franchise-duplicate-check.tsx", "utf8");

describe("franchise duplicate check UI", () => {
  it("keeps validation tokens but removes the empty result panel", () => {
    assert.match(source, /const hiddenFields = \(/);
    assert.match(source, /status === "ready" && matches\.length === 0/);
    assert.match(source, /return hiddenFields/);
    assert.match(source, /\{hiddenFields\}[\s\S]*status === "loading"/);
  });
});
