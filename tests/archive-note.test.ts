import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ArchiveNote, getArchiveNotePreview } from "@/components/archive/archive-note";

describe("archive note preview", () => {
  it("renders single and blank line breaks as separate paragraphs", () => {
    const markup = renderToStaticMarkup(createElement(ArchiveNote, {
      text: "Первый абзац.\nВторой абзац.\n\nТретий абзац.",
    }));
    assert.equal([...markup.matchAll(/<p\b/g)].length, 3);
    assert.match(markup, /space-y-4/);
  });
  it("does not truncate a short note", () => {
    assert.equal(getArchiveNotePreview("Короткая архивная заметка.", 40), null);
  });

  it("truncates a long note at a word boundary and adds an ellipsis", () => {
    assert.equal(
      getArchiveNotePreview(`Однажды эта запись оказалась в архиве ${"а".repeat(250)}`, 24),
      "Однажды эта запись…",
    );
  });

  it("truncates an uninterrupted long word at the maximum length", () => {
    assert.equal(getArchiveNotePreview(`сверхдлинноеслово${"а".repeat(250)}`, 10), "сверхдлинн…");
  });

  it("uses 500 characters and keeps a hidden remainder shorter than 250 visible", () => {
    assert.equal(getArchiveNotePreview("а".repeat(500)), null);
    assert.equal(getArchiveNotePreview("а".repeat(749)), null);
    assert.equal(getArchiveNotePreview("а".repeat(750)), `${"а".repeat(500)}…`);
  });

  it("counts the actual hidden text after trimming to a word boundary", () => {
    const beginning = "а".repeat(490);
    assert.equal(getArchiveNotePreview(`${beginning} ${"б".repeat(248)}`), null);
    assert.equal(getArchiveNotePreview(`${beginning} ${"б".repeat(249)}`), `${beginning}…`);
  });

  it("does not show an expand action when fewer than 250 characters would be hidden", () => {
    const text = "а".repeat(749);
    const markup = renderToStaticMarkup(createElement(ArchiveNote, { text }));
    assert.ok(markup.includes(text));
    assert.doesNotMatch(markup, /Развернуть/);
  });

  it("shows editorial text in full while keeping provider text collapsible", () => {
    const text = "Редакционная справка ".repeat(40);
    const editorial = renderToStaticMarkup(createElement(ArchiveNote, { text, collapsible: false }));
    const provider = renderToStaticMarkup(createElement(ArchiveNote, { text }));
    assert.match(editorial, /Редакционная справка Редакционная справка/);
    assert.doesNotMatch(editorial, /Развернуть/);
    assert.match(provider, /Развернуть/);
  });
});
