"use client";

import Link from "next/link";

import { QuizParticipationButton } from "@/components/quizzes/quiz-participation-button";
import { QuizResult } from "@/components/quizzes/quiz-result";
import { MosaicGame } from "./mosaic-game";
import { MosaicCanvas } from "./mosaic-canvas";
import { MosaicPoster } from "./mosaic-poster";
import { QuizInlineAnswer } from "./quiz-inline-answer";
import { useExternalInterface } from "@/components/external-interface/external-interface-layer";
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
  participant: initialParticipant,
  quiz,
}: {
  finished?: boolean;
  variant?: "page" | "modal";
  unavailableMediaTypeNames: string[];
  onOpenArchive?: () => void;
  participant: QuizParticipantState | null;
  quiz: ActiveQuiz;
}) {
  const { quizParticipant } = useExternalInterface();
  const liveParticipant = quizParticipant?.quizId === quiz.id
    && (quizParticipant.revision ?? 0) >= (initialParticipant?.revision ?? 0) ? quizParticipant : null;
  const participant = initialParticipant?.completed ? initialParticipant : liveParticipant ?? initialParticipant;
  const awaitingStart = quiz.type === "mosaic" && !participant && !finished;
  return (
    <div className="relative flex min-h-0 min-w-0 flex-col items-center gap-3 pb-3 text-center">
      {quiz.question ? (
        <p className="w-full break-words whitespace-pre-wrap text-lg">{quiz.question}</p>
      ) : null}
      {awaitingStart ? (
        <div className="relative mx-auto w-full max-w-[320px]">
          <MosaicCanvas readOnly imageUrl={null} seed={0} openedMask={0} />
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-stone-950/40 p-4">
            {unavailableMediaTypeNames.length === 0 ? (
              <QuizParticipationButton isParticipating={false} stayOnQuiz idleLabel="Начать игру"
                className="border-stone-300 bg-stone-50 px-6 text-base text-stone-700 shadow-lg transition-colors hover:border-stone-700 hover:bg-stone-100 hover:text-stone-950" />
            ) : <Button type="button" disabled variant="outline" className="bg-stone-50 text-stone-950">Начать игру</Button>}
          </div>
        </div>
      ) : null}
      {quiz.type === "mosaic" && !participant && finished && quiz.imageUrl ? <MosaicPoster imageUrl={quiz.imageUrl} /> : null}
      {quiz.type === "mosaic" && participant ? <MosaicGame key={quiz.id} quiz={quiz} participant={participant} finished={finished} onOpenArchive={onOpenArchive} /> : null}
      {quiz.type !== "mosaic" && quiz.imageUrl ? (
        <div className="w-full">
        {/* Protected quiz images need browser credentials. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={quiz.imageUrl} alt="Изображение к вопросу" className={`mx-auto h-auto w-auto max-w-full rounded-md object-contain ${variant === "page" ? "max-h-[min(50dvh,32rem)]" : "max-h-[min(42dvh,22rem)]"}`} />
        </div>
      ) : null}
      <div className="grid min-w-0 w-full shrink-0 justify-items-center gap-3">
        {quiz.type !== "mosaic" && participant && !participant.completed && !finished && unavailableMediaTypeNames.length === 0 ? <QuizInlineAnswer key={`answer-search-${quiz.id}`} quiz={quiz} participant={participant} /> : null}
        {quiz.type !== "mosaic" || !participant ? <QuizAnswerReveal key={`answer-reveal-${quiz.id}`} quizId={quiz.id} endsAt={quiz.endsAt} solved={participant?.outcome === "correct"} /> : null}
        {quiz.type === "mosaic" && participant ? null : participant?.completed ? (
          <QuizResult participant={participant} />
        ) : finished ? null : unavailableMediaTypeNames.length > 0 ? (
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
        ) : awaitingStart ? null : (
          <QuizParticipationButton isParticipating={participant !== null} onOpenArchive={onOpenArchive} stayOnQuiz={!participant} idleLabel="Начать игру" />
        )}
      </div>
    </div>
  );
}
