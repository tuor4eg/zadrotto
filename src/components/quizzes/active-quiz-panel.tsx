"use client";

import Image from "next/image";
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
  unavailableMediaTypeNames,
  onOpenArchive,
  participant,
  quiz,
}: {
  finished?: boolean;
  unavailableMediaTypeNames: string[];
  onOpenArchive?: () => void;
  participant: QuizParticipantState | null;
  quiz: ActiveQuiz;
}) {
  return (
    <div className="relative flex h-full min-h-0 flex-col items-center gap-3 pb-3 text-center">
      {quiz.question ? (
        <p className="whitespace-pre-wrap text-lg">{quiz.question}</p>
      ) : null}
      {quiz.imageUrl ? (
        <div className="relative min-h-0 w-full flex-1">
          <Image
            src={quiz.imageUrl}
            alt="Изображение к вопросу"
            fill
            sizes="100vw"
            unoptimized
            className="rounded-md object-contain"
          />
        </div>
      ) : null}
      <div className="mt-auto grid w-full shrink-0 justify-items-center gap-3">
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
