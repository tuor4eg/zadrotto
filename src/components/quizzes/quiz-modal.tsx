"use client";

import { ArrowLeft, CircleHelp, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ActiveQuizPanel } from "@/components/quizzes/active-quiz-panel";
import { QuizNoActiveState } from "@/components/quizzes/quiz-no-active-state";
import { BugReportEntityContextRegistration } from "@/components/bug-reports/bug-report-entity-context";
import { QuizRules } from "@/components/quizzes/quiz-rules";
import type { ActiveQuiz, QuizParticipantState } from "@/lib/quizzes/model";

export function QuizModal({
  unavailableMediaTypeNames,
  onClose,
  participant,
  quiz,
}: {
  unavailableMediaTypeNames: string[];
  onClose: () => void;
  participant: QuizParticipantState | null;
  quiz: ActiveQuiz | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [view, setView] = useState<"quiz" | "rules">("quiz");
  const [dialogTop, setDialogTop] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  function openArchive() {
    onClose();
    if (pathname !== "/archive") router.push("/archive");
  }

  function openRules() {
    if (dialogTop === null) {
      setDialogTop(dialogRef.current?.getBoundingClientRect().top ?? 0);
    }
    setView("rules");
  }

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
      className={`fixed inset-0 z-[100] grid justify-items-center overflow-y-auto bg-stone-950/55 p-3 sm:p-5 ${dialogTop === null ? "items-center" : "items-start"}`}
      style={dialogTop === null ? undefined : { paddingTop: `${dialogTop}px` }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {quiz ? (
        <BugReportEntityContextRegistration
          context={{ entityId: String(quiz.id), entityType: "quiz" }}
        />
      ) : null}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-quiz-title"
        tabIndex={-1}
        className={`archive-paper archive-panel relative flex h-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-y-auto p-5 shadow-2xl sm:p-8 ${dialogTop === null ? "my-auto" : "my-0"}`}
      >
        <div className="pointer-events-auto left-2 top-2 z-20 flex items-center gap-1 sm:left-3 sm:top-3" style={{ position: "absolute" }}>
          {quiz ? (
            view === "quiz" ? (
              <>
                <button
                  type="button"
                  className="touch-manipulation grid size-9 shrink-0 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700"
                  aria-label="Открыть правила квиза"
                  onClick={openRules}
                >
                  <CircleHelp className="size-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="touch-manipulation grid size-9 shrink-0 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700"
                aria-label="Назад к квизу"
                onClick={() => setView("quiz")}
              >
                <ArrowLeft className="size-4" />
              </button>
            )
          ) : null}
        </div>
        <button
          type="button"
          className="pointer-events-auto right-2 top-2 z-20 grid size-9 shrink-0 touch-manipulation place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700 sm:right-3 sm:top-3"
          style={{ position: "absolute" }}
          aria-label="Закрыть квиз"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
        <div className="pointer-events-none mb-5 px-12 text-center sm:px-32">
          <h2 id="active-quiz-title" className="whitespace-nowrap media-carrier-font-pc-steam text-2xl sm:text-3xl">
            {view === "rules" ? "Как играть" : "Квиз"}
          </h2>
        </div>
        {!quiz ? (
          <div className="flex min-h-80">
            <QuizNoActiveState />
          </div>
        ) : view === "rules" ? (
          <QuizRules />
        ) : (
          <ActiveQuizPanel
            variant="modal"
            onOpenArchive={openArchive}
            participant={participant}
            quiz={quiz}
            unavailableMediaTypeNames={unavailableMediaTypeNames}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
