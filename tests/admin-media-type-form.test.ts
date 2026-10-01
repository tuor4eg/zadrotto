import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("admin media type form", () => {
  it("accepts an optional code on creation and falls back to the name", () => {
    const form = read("src/app/admin/(protected)/media-types/media-type-form.tsx");
    const actions = read("src/app/admin/(protected)/media-types/actions.ts");

    assert.match(form, /name=\{values\?\.code \? undefined : "code"\}/);
    assert.doesNotMatch(form, /name="code"[\s\S]*required/);
    assert.match(actions, /const requestedCode = getFormString\(formData, "code"\)/);
    assert.match(actions, /code: slugifyCodePart\(requestedCode \|\| input\.value\.name\)/);
  });

  it("keeps an existing code read-only", () => {
    const form = read("src/app/admin/(protected)/media-types/media-type-form.tsx");
    const actions = read("src/app/admin/(protected)/media-types/actions.ts");

    assert.match(form, /readOnly=\{Boolean\(values\?\.code\)\}/);
    assert.doesNotMatch(actions, /updateMediaType\(\{[\s\S]*code:/);
  });
});
