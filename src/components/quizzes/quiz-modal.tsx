"use client";

import { ArrowLeft, CircleHelp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ActiveQuizPanel } from "@/components/quizzes/active-quiz-panel";
import { BugReportEntityContextRegistration } from "@/components/bug-reports/bug-report-entity-context";
import type { ActiveQuiz } from "@/lib/quizzes/model";

export function QuizModal({
  isParticipating,
  unavailableMediaTypeNames,
  onClose,
  quiz,
}: {
  isParticipating: boolean;
  unavailableMediaTypeNames: string[];
  onClose: () => void;
  quiz: ActiveQuiz;
}) {
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [quizDialogHeight, setQuizDialogHeight] = useState<number | null>(null);
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
      <BugReportEntityContextRegistration context={{ entityId: String(quiz.id), entityType: "quiz" }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-quiz-title"
        tabIndex={-1}
        className="archive-paper archive-panel relative my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto p-5 shadow-2xl sm:p-8"
        style={isRulesOpen && quizDialogHeight !== null
          ? { minHeight: `${quizDialogHeight}px` }
          : undefined}
      >
        <button
          type="button"
          className="left-2 top-2 z-10 grid size-9 shrink-0 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700 sm:left-3 sm:top-3"
          style={{ position: "absolute" }}
          aria-label={isRulesOpen ? "Назад к викторине" : "Открыть правила викторины"}
          onClick={() => {
            if (!isRulesOpen) {
              setQuizDialogHeight(dialogRef.current?.getBoundingClientRect().height ?? null);
            }
            setIsRulesOpen((current) => !current);
          }}
        >
          {isRulesOpen ? (
            <ArrowLeft className="size-4" />
          ) : (
            <CircleHelp className="size-4" />
          )}
        </button>
        <button
          type="button"
          className="right-2 top-2 z-10 grid size-9 shrink-0 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700 sm:right-3 sm:top-3"
          style={{ position: "absolute" }}
          aria-label="Закрыть викторину"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
        <div className="mb-5 px-24 text-center sm:px-32">
          <h2 id="active-quiz-title" className="font-serif text-3xl">
            {isRulesOpen ? "Правила викторины" : "Викторина"}
          </h2>
        </div>
        <div className="grid gap-5">
          {isRulesOpen ? (
            <div className="mx-auto max-w-xl text-center text-sm leading-6 text-stone-700">
              <ol className="list-decimal space-y-3 pl-5 text-left">
                <li>Присоединитесь к викторине и перейдите в архив.</li>
                <li>По вопросу и изображению найдите запись, которая кажется правильным ответом.</li>
                <li>Нажмите на записи кнопку проверки догадки. Неверный ответ отнимает одну попытку.</li>
                <li>Правильный ответ завершает игру. Победителем становится первый ответивший верно.</li>
              </ol>
            </div>
          ) : (
            <ActiveQuizPanel
              isParticipating={isParticipating}
              onOpenArchive={onClose}
              quiz={quiz}
              unavailableMediaTypeNames={unavailableMediaTypeNames}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
