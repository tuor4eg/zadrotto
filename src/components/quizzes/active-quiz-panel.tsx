"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { QuizParticipationButton } from "@/components/quizzes/quiz-participation-button";
import { formatQuizTimeRemaining, type ActiveQuiz } from "@/lib/quizzes/model";

export function ActiveQuizPanel({
  isParticipating,
  onOpenArchive,
  quiz,
}: {
  isParticipating: boolean;
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
      <QuizParticipationButton isParticipating={isParticipating} onOpenArchive={onOpenArchive} />
      <p className="absolute bottom-0 right-0 text-right text-xs text-stone-600">
        {formatQuizTimeRemaining(quiz.endsAt, now)}
      </p>
    </div>
  );
}
