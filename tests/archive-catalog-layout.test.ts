import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("src/components/archive/archive-catalog-layout.tsx", "utf8");

describe("archive catalog preview layout", () => {
  it("caps the desktop preview at the available viewport height and scrolls its contents", () => {
    assert.match(source, /const height = availableHeight/);
    assert.doesNotMatch(source, /Math\.max\(previewPanel\.offsetHeight, availableHeight\)/);
    assert.match(source, /maxHeight: fixedPreview\.height/);
    assert.match(
      source,
      /min-h-0 flex-1 overflow-x-hidden overflow-y-auto \[-ms-overflow-style:none\] \[scrollbar-width:none\] \[&::\-webkit-scrollbar\]:hidden/,
    );
    assert.match(source, /archive-scrollbar grid min-h-0 flex-1/);
  });
});
