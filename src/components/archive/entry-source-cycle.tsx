"use client";

import { useId, useState, type ReactNode } from "react";

export function EntrySourceCycle({ count, cover, description, lastCover, lastDescription, children }: {
  count: number;
  cover: ReactNode;
  description: ReactNode;
  lastCover: ReactNode;
  lastDescription: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentsId = useId();

  return (
    <li className="contents">
      <ul id={contentsId} hidden={!expanded} className={expanded ? "contents" : undefined}>
        {expanded ? children : null}
      </ul>
      <div className="flex min-w-0 gap-2">
        {expanded ? lastCover : cover}
        <div className="flex min-w-0 max-w-36 flex-col items-start gap-2 break-words pt-1 text-sm">
          <div className="space-y-1">{expanded ? lastDescription : description}</div>
          <button type="button" aria-expanded={expanded} aria-controls={contentsId}
            className="mt-auto shrink-0 cursor-pointer font-mono text-[10px] uppercase tracking-wider text-stone-600 hover:text-red-950"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Свернуть" : `Показать все ${count} →`}
          </button>
        </div>
      </div>
    </li>
  );
}
