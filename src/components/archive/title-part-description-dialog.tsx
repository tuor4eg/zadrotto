"use client";

import { useLayoutEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export function TitlePartDescriptionDialog({ title, description, onClose }: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const { scrollX, scrollY } = window;
    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const padding = Number.parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${padding + scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";
    dialog.showModal();
    window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    };
  }, []);

  return <dialog ref={dialogRef} aria-labelledby={headingId}
    // archive-paper sets position: relative; native modal positioning must win.
    style={{ position: "fixed", inset: 0, overflowY: "auto" }}
    className="archive-paper archive-panel m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto p-5 text-stone-950 backdrop:bg-stone-950/45 sm:p-6"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="pr-8">
      <h2 id={headingId} className="min-w-0 break-words font-serif text-xl leading-tight">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Закрыть описание"
        className="pointer-events-auto right-2 top-2 z-20 grid size-9 shrink-0 touch-manipulation place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700 sm:right-3 sm:top-3"
        style={{ position: "absolute" }}>
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
    <p className="mt-4 whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere] sm:text-base">{description}</p>
  </dialog>;
}
