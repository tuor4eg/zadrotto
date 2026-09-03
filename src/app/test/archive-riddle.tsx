"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";

import { useExternalInterface } from "@/components/external-interface/external-interface-layer";
import { useQuizParticipation } from "@/components/quizzes/quiz-participation-button";
import { ImageViewer } from "@/components/ui/image-viewer";
import { formatQuizTimeRemaining, type ActiveQuiz } from "@/lib/quizzes/model";

type ArchiveRiddleProps = {
  isCompleted: boolean;
  isParticipating: boolean;
  quiz: ActiveQuiz | null;
};

export function ArchiveRiddle({
  isCompleted,
  isParticipating,
  quiz,
}: ArchiveRiddleProps) {
  const { quizParticipant } = useExternalInterface();
  const [now, setNow] = useState(() => new Date());
  const isLocallyCompleted = Boolean(
    quizParticipant && quizParticipant.quizId === quiz?.id && quizParticipant.completed,
  );
  const canOpenQuiz = Boolean(quiz && !isCompleted && !isLocallyCompleted);
  const { error, openArchive, pending } = useQuizParticipation({ isParticipating });

  function handleCardKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!canOpenQuiz || pending || (event.key !== "Enter" && event.key !== " ")) return;

    event.preventDefault();
    void openArchive();
  }

  useEffect(() => {
    if (!quiz) return;

    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, [quiz]);

  return (
    <section
      className={`archive-paper archive-panel relative flex min-h-[280px] flex-col overflow-hidden p-3 sm:p-4 lg:h-[280px] lg:min-h-0 ${canOpenQuiz ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-stone-950" : ""}`}
      aria-labelledby="test-archive-riddle"
      aria-disabled={canOpenQuiz ? undefined : true}
      onClick={canOpenQuiz && !pending ? () => void openArchive() : undefined}
      onKeyDown={handleCardKeyDown}
      role={canOpenQuiz ? "button" : undefined}
      tabIndex={canOpenQuiz ? 0 : undefined}
    >
      <div className="flex h-8 shrink-0 items-start gap-2">
          <CircleHelp aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-red-950/70" />
          <h2 id="test-archive-riddle" className="font-serif text-2xl leading-none text-stone-950">
            Загадка архива
          </h2>
          {quiz ? (
            <span className="ml-auto shrink-0 whitespace-nowrap pt-1 text-right text-[10px] text-stone-600 xl:text-xs">
              {formatQuizTimeRemaining(quiz.endsAt, now)}
            </span>
          ) : null}
      </div>

      {quiz ? (
          <>
            <p className="mt-1 shrink-0 text-center whitespace-pre-wrap font-serif text-xl leading-7 text-stone-900">
              {quiz.question?.trim() || "Ответ спрятан среди записей архива."}
            </p>
            <div
              className="relative z-10 flex min-h-0 flex-1 items-center justify-center py-2"
            >
              {quiz.imageUrl ? (
                <div
                  className="flex max-h-[170px] max-w-[90%] items-center justify-center"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <ImageViewer
                    src={quiz.imageUrl}
                    alt="Кадр из загадки"
                    title="Кадр из загадки"
                    triggerClassName="block max-h-[170px] max-w-full cursor-zoom-in rounded-md"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={quiz.imageUrl}
                      alt="Кадр из загадки"
                      className="max-h-[170px] max-w-full rounded-md object-contain"
                    />
                  </ImageViewer>
                </div>
              ) : null}
            </div>
            {error ? (
              <p className="mt-auto text-center text-sm text-red-700" role="alert">{error}</p>
            ) : !canOpenQuiz ? (
              <p className="mt-auto font-mono text-[10px] uppercase tracking-wider text-stone-500">
                Загадка уже разгадана
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 h-12 shrink-0 text-sm leading-6 text-stone-600">
            Сейчас в архиве всё спокойно. Новая загадка появится позже.
          </p>
      )}
    </section>
  );
}
