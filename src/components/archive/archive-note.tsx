"use client";

import { useState } from "react";

export const ARCHIVE_NOTE_PREVIEW_LENGTH = 255;

type ArchiveNoteProps = {
  text?: string | null;
  maxWidthClassName?: string;
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

  return `${preview.slice(0, lastWhitespaceIndex > 0 ? lastWhitespaceIndex : maxLength).trimEnd()}…`;
}

export function ArchiveNote({ text, maxWidthClassName = "max-w-[620px]" }: ArchiveNoteProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleText = text?.trim() || "Здесь пока пусто...";
  const preview = getArchiveNotePreview(visibleText);
  const displayedText = preview && !isExpanded ? preview : visibleText;

  return (
    <div className={`archive-notebook-note mx-auto w-full ${maxWidthClassName}`}>
      <div className="archive-notebook-tape" aria-hidden="true" />
      <div className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
        Архивная заметка
      </div>
      <p className="archive-typewriter-text text-[15px] leading-8 text-stone-900">
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
