"use client";

import { CircleHelp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import { useExternalInterface } from "@/components/external-interface/external-interface-layer";
import { QuizNoActiveState } from "@/components/quizzes/quiz-no-active-state";
import { useQuizParticipation } from "@/components/quizzes/quiz-participation-button";
import { ImageViewer } from "@/components/ui/image-viewer";
import { formatQuizTimeRemaining, type ActiveQuiz } from "@/lib/quizzes/model";

type ArchiveRiddleProps = {
  authenticated: boolean;
  isCompleted: boolean;
  isParticipating: boolean;
  quiz: ActiveQuiz | null;
  size?: "default" | "large";
};

export function ArchiveRiddle({
  authenticated,
  isCompleted,
  isParticipating,
  quiz,
  size = "default",
}: ArchiveRiddleProps) {
  const router = useRouter();
  const { quizParticipant } = useExternalInterface();
  const [loginOpen, setLoginOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const isLocallyCompleted = Boolean(
    quizParticipant && quizParticipant.quizId === quiz?.id && quizParticipant.completed,
  );
  const canOpenQuiz = Boolean(quiz && !isCompleted && !isLocallyCompleted);
  const { error, openArchive, pending } = useQuizParticipation({ isParticipating });

  function openQuiz() {
    if (!authenticated) {
      setLoginOpen(true);
      return;
    }
    void openArchive();
  }

  function handleCardKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!canOpenQuiz || pending || (event.key !== "Enter" && event.key !== " ")) return;

    event.preventDefault();
    openQuiz();
  }

  useEffect(() => {
    if (!quiz) return;

    const interval = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(interval);
  }, [quiz]);

  const timeRemaining = quiz ? formatQuizTimeRemaining(quiz.endsAt, now) : null;

  return (
    <>
      <section
      className={`archive-paper archive-panel relative flex min-h-[280px] flex-col overflow-hidden p-3 sm:p-4 lg:min-h-0 ${size === "large" ? "lg:h-[360px]" : "lg:h-[280px]"} ${canOpenQuiz ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-stone-950" : ""}`}
      aria-labelledby="main-archive-riddle"
      aria-disabled={canOpenQuiz ? undefined : true}
      onClick={canOpenQuiz && !pending ? openQuiz : undefined}
      onKeyDown={handleCardKeyDown}
      role={canOpenQuiz ? "button" : undefined}
      tabIndex={canOpenQuiz ? 0 : undefined}
    >
      <div className="flex flex-wrap shrink-0 items-start gap-x-2 gap-y-1 sm:h-8 sm:flex-nowrap">
          <CircleHelp aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-red-950/70" />
          <h2 id="main-archive-riddle" className="font-serif text-2xl leading-none text-stone-950">
            Загадка архива
          </h2>
          {timeRemaining ? (
            <span className="archive-riddle-timer ml-auto shrink-0 whitespace-nowrap pt-1 text-right text-xs text-stone-600">
              {timeRemaining}
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
                  className={`flex max-w-[90%] items-center justify-center ${size === "large" ? "max-h-[250px]" : "max-h-[170px]"}`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <ImageViewer
                    src={quiz.imageUrl}
                    alt="Кадр из загадки"
                    title="Кадр из загадки"
                    triggerClassName={`block max-w-full cursor-zoom-in rounded-md ${size === "large" ? "max-h-[250px]" : "max-h-[170px]"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={quiz.imageUrl}
                      alt="Кадр из загадки"
                      className={`max-w-full rounded-md object-contain ${size === "large" ? "max-h-[250px]" : "max-h-[170px]"}`}
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
          <QuizNoActiveState compact={size === "default"} />
      )}
      </section>
      {loginOpen
        ? createPortal(
            <AuthorLoginModal
              onClose={() => setLoginOpen(false)}
              onSuccess={() => {
                setLoginOpen(false);
                router.refresh();
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
