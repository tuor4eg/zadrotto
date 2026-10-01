import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("keeps the light archive palette when the system prefers a dark theme", () => {
  const globals = readFileSync("src/app/globals.css", "utf8");

  assert.match(globals, /:root\s*\{[\s\S]*color-scheme:\s*light/);
  assert.doesNotMatch(globals, /@media\s*\(prefers-color-scheme:\s*dark\)/);
});
