"use client";

import { useEffect, useRef, useState } from "react";
import { QuizLivesCounter } from "./quiz-lives-counter";
import { useExternalInterface } from "@/components/external-interface/external-interface-layer";
import { QuizAnswerPicker, type QuizAnswerItem } from "./quiz-answer-picker";
import { QuizGuessButton } from "./quiz-guess-button";
import { QuizSelectedEntry } from "./quiz-selected-entry";
import type { ActiveQuiz, QuizParticipantState } from "@/lib/quizzes/model";

export function QuizInlineAnswer({ quiz, participant, disabled = false }: {
  quiz: ActiveQuiz;
  participant: QuizParticipantState;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<QuizAnswerItem | null>(null);
  const [pending, setPending] = useState(false);
  const counterRef = useRef<HTMLDivElement>(null);
  const { registerInlineQuizCounter } = useExternalInterface();
  useEffect(() => {
    const counter = counterRef.current;
    if (!counter) return;
    let unregister: (() => void) | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !unregister) unregister = registerInlineQuizCounter(quiz.id);
      else if (!entry.isIntersecting && unregister) { unregister(); unregister = undefined; }
    });
    observer.observe(counter);
    return () => { observer.disconnect(); unregister?.(); };
  }, [quiz.id, registerInlineQuizCounter]);

  return <div className="grid w-full max-w-lg gap-3 text-left">
    <div ref={counterRef} className="flex justify-center"><QuizLivesCounter participant={participant} /></div>
    <div aria-label="Типы записей в этом квизе" className="flex flex-wrap justify-center gap-1.5">
      {quiz.mediaTypeOptions?.map(({ code, name }) => <span key={code}
        className="rounded-full bg-[var(--archive-bg-end)] px-2.5 py-1 text-xs font-medium lowercase leading-4 text-stone-100">{name}</span>)}
    </div>
    <QuizAnswerPicker allowedMediaTypes={quiz.mediaTypes} mediaTypes={[]} searchUrl={`/api/quizzes/${quiz.id}/title-search`}
      onSelect={setSelected} disabled={disabled || pending} inputName="quizAnswerMediaItemId" showSelectionSummary={false} />
    {selected ? <QuizSelectedEntry key={selected.id} quizId={quiz.id} mediaItemId={selected.id} /> : null}
    {selected ? <div className="flex justify-center"><QuizGuessButton key={selected.id} titleId={selected.id} participantState={participant} disabled={disabled} onPendingChange={setPending} /></div> : null}
  </div>;
}
