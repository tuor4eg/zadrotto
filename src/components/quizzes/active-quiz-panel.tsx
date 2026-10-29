"use client";

import Link from "next/link";

import { QuizParticipationButton } from "@/components/quizzes/quiz-participation-button";
import { QuizResult } from "@/components/quizzes/quiz-result";
import { QuizAnswerReveal } from "@/components/quizzes/quiz-answer-reveal";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  type ActiveQuiz,
  type QuizParticipantState,
} from "@/lib/quizzes/model";

export function ActiveQuizPanel({
  finished = false,
  variant = "page",
  unavailableMediaTypeNames,
  onOpenArchive,
  participant,
  quiz,
}: {
  finished?: boolean;
  variant?: "page" | "modal";
  unavailableMediaTypeNames: string[];
  onOpenArchive?: () => void;
  participant: QuizParticipantState | null;
  quiz: ActiveQuiz;
}) {
  return (
    <div className={`relative flex min-h-0 flex-col items-center gap-3 pb-3 text-center ${variant === "page" && quiz.imageUrl ? `lg:grid lg:h-full lg:content-start lg:justify-items-center ${quiz.question ? "lg:grid-rows-[auto_minmax(0,max-content)_auto]" : "lg:grid-rows-[minmax(0,max-content)_auto]"}` : ""}`}>
      {quiz.question ? (
        <p className="whitespace-pre-wrap text-lg">{quiz.question}</p>
      ) : null}
      {quiz.imageUrl ? (
        <div className={variant === "page" ? "w-full lg:grid lg:min-h-0 lg:place-items-center" : "w-full"}>
        {/* Protected quiz images need browser credentials and retain their intrinsic size. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={quiz.imageUrl} alt="Изображение к вопросу" className={`mx-auto h-auto w-auto max-w-full rounded-md object-contain ${variant === "page" ? "max-h-[min(50dvh,32rem)] lg:min-h-0 lg:max-h-full" : "max-h-[min(42dvh,22rem)]"}`} />
        </div>
      ) : null}
      <div className="grid w-full shrink-0 justify-items-center gap-3">
        <QuizAnswerReveal key={quiz.id} quizId={quiz.id} endsAt={quiz.endsAt} solved={participant?.outcome === "correct"} />
        {participant?.completed ? (
          <QuizResult participant={participant} />
        ) : finished ? (
          <p className="font-serif text-base text-stone-700 sm:text-lg">Квиз завершён</p>
        ) : unavailableMediaTypeNames.length > 0 ? (
          <div className="grid max-w-xl gap-4 rounded-md border border-amber-800/25 bg-amber-50/70 p-4 text-sm leading-6 text-stone-700">
            <p>
              Этот квиз касается разделов, которые ты отключил: {unavailableMediaTypeNames.join(", ")}.
              Включи их в интересах, чтобы участвовать на равных, или спокойно пропусти этот раунд.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/author/settings/media-types" className={buttonVariants({ size: "sm" })}>
                Настроить интересы
              </Link>
              {onOpenArchive ? (
                <Button type="button" size="sm" variant="outline" onClick={onOpenArchive}>
                  Пропустить в этот раз
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <QuizParticipationButton isParticipating={participant !== null} onOpenArchive={onOpenArchive} />
        )}
      </div>
    </div>
  );
}
