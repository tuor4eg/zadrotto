import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getArchiveNotePreview } from "@/components/archive/archive-note";

describe("archive note preview", () => {
  it("does not truncate a short note", () => {
    assert.equal(getArchiveNotePreview("Короткая архивная заметка.", 40), null);
  });

  it("truncates a long note at a word boundary and adds an ellipsis", () => {
    assert.equal(
      getArchiveNotePreview("Однажды эта запись оказалась в архиве", 24),
      "Однажды эта запись…",
    );
  });

  it("truncates an uninterrupted long word at the maximum length", () => {
    assert.equal(getArchiveNotePreview("сверхдлинноеслово", 10), "сверхдлинн…");
  });
});
