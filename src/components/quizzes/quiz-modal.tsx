"use client";

import { ArrowLeft, CircleHelp, Heart, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ActiveQuizPanel } from "@/components/quizzes/active-quiz-panel";
import { BugReportEntityContextRegistration } from "@/components/bug-reports/bug-report-entity-context";
import { Button } from "@/components/ui/button";
import type { ActiveQuiz } from "@/lib/quizzes/model";
import { AUTHOR_RATING_TONE_CLASS_NAMES } from "@/lib/ratings/tone";

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
  const [dialogTop, setDialogTop] = useState<number | null>(null);
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
      className={`fixed inset-0 z-[100] grid justify-items-center overflow-y-auto bg-stone-950/55 p-3 sm:p-5 ${dialogTop === null ? "items-center" : "items-start"}`}
      style={dialogTop === null ? undefined : { paddingTop: `${dialogTop}px` }}
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
        className={`archive-paper archive-panel relative max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto p-5 shadow-2xl sm:p-8 ${dialogTop === null ? "my-auto" : "my-0"}`}
      >
        <button
          type="button"
          className="left-2 top-2 z-10 grid size-9 shrink-0 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700 sm:left-3 sm:top-3"
          style={{ position: "absolute" }}
          aria-label={isRulesOpen ? "Назад к викторине" : "Открыть правила викторины"}
          onClick={() => {
            if (dialogTop === null) {
              setDialogTop(dialogRef.current?.getBoundingClientRect().top ?? 0);
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
            {isRulesOpen ? "Как играть" : "Викторина"}
          </h2>
        </div>
        {isRulesOpen ? (
          <div className="mx-auto max-w-xl text-sm leading-6 text-stone-700">
            <ol className="list-decimal space-y-3 pl-5">
              <li>Раз в день в 12:00 (MSK) публикуются вопросы викторины.</li>
              <li>
                Чтобы начать участие, нужно нажать следующую кнопку:
                <div className="mt-2 text-center">
                  <Button
                    className="archive-control-surface border-stone-300/80 font-mono text-xs uppercase tracking-wider text-stone-700 disabled:opacity-100"
                    disabled
                    variant="outline"
                  >
                    Продолжить поиск в архиве
                  </Button>
                </div>
              </li>
              <li>
                После этого в архиве нужно отыскать запись, которая, на ваш взгляд, является ответом на вопрос, и нажать кнопку:
                <div className="mt-2 text-center">
                  <Button
                    className={`h-9 border px-4 font-mono uppercase tracking-[0.08em] disabled:opacity-100 ${AUTHOR_RATING_TONE_CLASS_NAMES.good}`}
                    disabled
                    size="sm"
                    variant="positive"
                  >
                    Проверить догадку
                    <CircleHelp />
                  </Button>
                </div>
              </li>
              <li>
                Если ответ правильный, вы получаете балл. Если при этом ответили правильно первым — становитесь победителем. Если неправильно, можно попробовать ещё, пока не кончатся все попытки. Число попыток отображается на экране в виде сердечек.
                <div className="mt-3 flex justify-center">
                  <span className="archive-paper-surface flex items-center gap-1 rounded-full border border-red-900/25 bg-stone-50/90 px-3 py-2 shadow-sm">
                    {Array.from({ length: 3 }, (_, index) => (
                      <Heart
                        key={index}
                        aria-hidden="true"
                        className="size-5 fill-red-700 text-red-800 drop-shadow-sm"
                      />
                    ))}
                  </span>
                </div>
              </li>
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
    </div>,
    document.body,
  );
}
