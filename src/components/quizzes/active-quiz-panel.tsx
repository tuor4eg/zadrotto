import Image from "next/image";

import { QuizParticipationButton } from "@/components/quizzes/quiz-participation-button";
import type { ActiveQuiz } from "@/lib/quizzes/model";

export function ActiveQuizPanel({
  isParticipating,
  onOpenArchive,
  quiz,
}: {
  isParticipating: boolean;
  onOpenArchive?: () => void;
  quiz: ActiveQuiz;
}) {
  return (
    <>
      {quiz.question ? <p className="text-lg">{quiz.question}</p> : null}
      {quiz.imageUrl ? (
        <Image
          src={quiz.imageUrl}
          alt="Изображение к вопросу"
          width={1600}
          height={1200}
          unoptimized
          className="max-h-[600px] w-full rounded-md object-contain"
        />
      ) : null}
      <p className="text-sm text-stone-600">
        До {new Intl.DateTimeFormat("ru-RU", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(quiz.endsAt))}
      </p>
      <QuizParticipationButton isParticipating={isParticipating} onOpenArchive={onOpenArchive} />
    </>
  );
}
