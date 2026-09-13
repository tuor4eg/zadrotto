import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ArchiveNote, getArchiveNotePreview } from "@/components/archive/archive-note";

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

  it("shows editorial text in full while keeping provider text collapsible", () => {
    const text = "Редакционная справка ".repeat(16);
    const editorial = renderToStaticMarkup(createElement(ArchiveNote, { text, collapsible: false }));
    const provider = renderToStaticMarkup(createElement(ArchiveNote, { text }));
    assert.match(editorial, /Редакционная справка Редакционная справка/);
    assert.doesNotMatch(editorial, /Развернуть/);
    assert.match(provider, /Развернуть/);
  });
});
