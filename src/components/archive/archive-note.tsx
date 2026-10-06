"use client";

import { useState } from "react";

export const ARCHIVE_NOTE_PREVIEW_LENGTH = 350;
const ARCHIVE_NOTE_MIN_HIDDEN_LENGTH = 100;

type ArchiveNoteProps = {
  text?: string | null;
  maxWidthClassName?: string;
  collapsible?: boolean;
};

export function getArchiveNotePreview(
  text: string,
  maxLength = ARCHIVE_NOTE_PREVIEW_LENGTH,
) {
  if (text.length <= maxLength) {
    return null;
  }

  const preview = text.slice(0, maxLength);
  const lastWhitespaceIndex = preview.search(/\s+\S*$/);
  const previewText = preview.slice(0, lastWhitespaceIndex > 0 ? lastWhitespaceIndex : maxLength).trimEnd();

  if (text.length - previewText.length < ARCHIVE_NOTE_MIN_HIDDEN_LENGTH) {
    return null;
  }

  return `${previewText}…`;
}

export function ArchiveNote({ text, maxWidthClassName = "max-w-[620px]", collapsible = true }: ArchiveNoteProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleText = text?.trim() || "Здесь пока пусто...";
  const preview = collapsible ? getArchiveNotePreview(visibleText) : null;
  const displayedText = preview && !isExpanded ? preview : visibleText;

  return (
    <div className={`archive-notebook-note mx-auto w-full ${maxWidthClassName}`}>
      <div className="archive-notebook-tape" aria-hidden="true" />
      <div className="archive-typewriter-text mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
        Архивная заметка
      </div>
      <p className="media-carrier-font-streaming whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-8 text-stone-800 sm:text-base sm:leading-9">
        {displayedText}
        {preview ? (
          <>
            {" "}
            <button
              type="button"
              className="font-semibold text-red-800 underline decoration-red-800/40 underline-offset-4 transition-colors hover:text-red-950 hover:decoration-red-950 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((currentValue) => !currentValue)}
            >
              {isExpanded ? "Свернуть" : "Развернуть"}
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}
