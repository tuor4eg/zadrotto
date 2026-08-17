"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { ActiveQuizPanel } from "@/components/quizzes/active-quiz-panel";
import type { ActiveQuiz } from "@/lib/quizzes/model";

export function QuizModal({
  isParticipating,
  onClose,
  quiz,
}: {
  isParticipating: boolean;
  onClose: () => void;
  quiz: ActiveQuiz;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElementRef.current?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-stone-950/55 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-quiz-title"
        tabIndex={-1}
        className="archive-paper archive-panel relative my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto p-5 shadow-2xl sm:p-8"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id="active-quiz-title" className="font-serif text-3xl">Викторина</h2>
          <button type="button" className="archive-control-surface grid size-9 shrink-0 place-items-center rounded-md border border-stone-300/80 bg-stone-50/60 transition-colors hover:border-stone-700 hover:bg-stone-50" aria-label="Закрыть викторину" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-5">
          <ActiveQuizPanel isParticipating={isParticipating} onOpenArchive={onClose} quiz={quiz} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
