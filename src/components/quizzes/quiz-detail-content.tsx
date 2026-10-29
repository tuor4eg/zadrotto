"use client";

import { ArrowLeft, CircleHelp } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CarouselArrowButton } from "@/components/archive/carousel-arrow-button";
import { ActiveQuizPanel } from "./active-quiz-panel";
import { QuizRules } from "./quiz-rules";
import type { ActiveQuiz, QuizParticipantState } from "@/lib/quizzes/model";

export function QuizDetailContent({ quiz, participant, finished, unavailableMediaTypeNames, adjacent }: {
  quiz: ActiveQuiz;
  participant: QuizParticipantState | null;
  finished: boolean;
  unavailableMediaTypeNames: string[];
  adjacent: { previousId: number | null; nextId: number | null };
}) {
  const [showRules, setShowRules] = useState(false);
  const router = useRouter();
  return <div className={`flex min-h-0 flex-col ${showRules ? "overflow-y-auto" : ""}`}>
    <div className="relative mb-5 shrink-0 px-12 text-center">
      <button type="button" onClick={() => setShowRules(value => !value)}
        aria-label={showRules ? "Назад к квизу" : "Открыть правила квиза"}
        className="absolute left-0 top-0 grid size-9 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700">
        {showRules ? <ArrowLeft className="size-4" /> : <CircleHelp className="size-4" />}
      </button>
      <h1 id="quiz-title" className="media-carrier-font-pc-steam text-center text-2xl sm:text-3xl">{showRules ? "Как играть" : "Квиз"}</h1>
    </div>
    {showRules ? <QuizRules /> : <div className="relative min-h-0 flex-1 px-8 sm:px-10">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-between">
        <CarouselArrowButton direction="previous" size="default" className="pointer-events-auto disabled:invisible" aria-label="Предыдущий квиз" disabled={adjacent.previousId === null} onClick={() => router.push(`/quizzes/${adjacent.previousId}`)} />
        <CarouselArrowButton direction="next" size="default" className="pointer-events-auto disabled:invisible" aria-label="Следующий квиз" disabled={adjacent.nextId === null} onClick={() => router.push(`/quizzes/${adjacent.nextId}`)} />
      </div>
      <ActiveQuizPanel finished={finished} participant={participant} quiz={quiz} unavailableMediaTypeNames={unavailableMediaTypeNames} />
    </div>}
  </div>;
}
