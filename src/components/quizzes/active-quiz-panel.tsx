"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { QuizParticipationButton } from "@/components/quizzes/quiz-participation-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatQuizTimeRemaining, type ActiveQuiz } from "@/lib/quizzes/model";

export function ActiveQuizPanel({
  isParticipating,
  unavailableMediaTypeNames,
  onOpenArchive,
  quiz,
}: {
  isParticipating: boolean;
  unavailableMediaTypeNames: string[];
  onOpenArchive?: () => void;
  quiz: ActiveQuiz;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="relative flex flex-col items-center gap-5 pb-8 text-center">
      {quiz.question ? <p className="text-lg">{quiz.question}</p> : null}
      {quiz.imageUrl ? (
        <Image
          src={quiz.imageUrl}
          alt="Изображение к вопросу"
          width={1600}
          height={1200}
          unoptimized
          className="mx-auto max-h-[600px] w-full rounded-md object-contain"
        />
      ) : null}
      {unavailableMediaTypeNames.length > 0 ? (
        <div className="grid max-w-xl gap-4 rounded-md border border-amber-800/25 bg-amber-50/70 p-4 text-sm leading-6 text-stone-700">
          <p>
            Эта викторина касается разделов, которые ты отключил: {unavailableMediaTypeNames.join(", ")}.
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
        <QuizParticipationButton isParticipating={isParticipating} onOpenArchive={onOpenArchive} />
      )}
      <p className="absolute bottom-0 right-0 text-right text-xs text-stone-600">
        {formatQuizTimeRemaining(quiz.endsAt, now)}
      </p>
    </div>
  );
}
