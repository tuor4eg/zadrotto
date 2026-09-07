import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const source = readFileSync("src/components/archive/archive-catalog-layout.tsx", "utf8")

describe("archive catalog preview layout", () => {
  it("keeps the desktop preview in normal grid flow with sticky positioning", () => {
    assert.match(source, /xl:sticky xl:top-4/)
    assert.match(source, /xl:h-\[calc\(100dvh-1\.75rem\)\]/)
    assert.match(source, /xl:max-h-\[calc\(100dvh-1\.75rem\)\]/)
    assert.match(source, /Sticky wrapper stays outside \.archive-textured-block/)
    assert.doesNotMatch(source, /position:\s*"fixed"/)
    assert.doesNotMatch(source, /FIXED_PREVIEW_TOP_OFFSET/)
    assert.doesNotMatch(source, /getBoundingClientRect/)
  })

  it("caps the desktop preview at the available viewport height and scrolls its contents", () => {
    assert.match(source, /archive-textured-block flex h-full min-h-0 w-full/)
    assert.match(
      source,
      /min-h-0 flex-1 overflow-x-hidden overflow-y-auto \[-ms-overflow-style:none\] \[scrollbar-width:none\] \[&::\-webkit-scrollbar\]:hidden/,
    )
    assert.match(source, /archive-scrollbar grid min-h-0 flex-1/)
  })
})
