"use client";

import { CircleHelp, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import {
  useExternalInterface,
  type QuizParticipantHudState,
} from "@/components/external-interface/external-interface-layer";
import { AUTHOR_RATING_TONE_CLASS_NAMES } from "@/lib/ratings/tone";

type QuizGuessResult = "correct" | "exhausted" | "winner";

function QuizGuessResultModal({
  comment,
  onClose,
  result,
}: {
  comment: string | null;
  onClose: () => void;
  result: QuizGuessResult;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isCorrect = result !== "exhausted";
  const isWinner = result === "winner";

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElement?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-stone-950/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-guess-result-title"
        aria-describedby="quiz-guess-result-description"
        tabIndex={-1}
        className="archive-paper archive-panel relative w-full max-w-md p-6 text-center shadow-2xl sm:p-8"
      >
        <button
          type="button"
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700"
          style={{ position: "absolute" }}
          aria-label="Закрыть результат викторины"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
        {isWinner ? (
          <Image
            alt=""
            className="mx-auto mb-4 h-auto w-40"
            height={525}
            src="/mascot/deadz_quiz_win.png"
            unoptimized
            width={350}
          />
        ) : isCorrect ? (
          <Image
            alt=""
            className="mx-auto mb-4 h-auto w-40"
            height={460}
            src="/mascot/deadz_quiz_correct.png"
            unoptimized
            width={420}
          />
        ) : (
          <Image
            alt=""
            className="mx-auto mb-4 h-auto w-40"
            height={525}
            src="/mascot/deadz_quiz_fail.png"
            unoptimized
            width={420}
          />
        )}
        <h2 id="quiz-guess-result-title" className="font-serif text-3xl">
          {isWinner ? "Победа!" : isCorrect ? "Верно!" : "Попытки закончились"}
        </h2>
        <p id="quiz-guess-result-description" className="mt-3 text-sm leading-6 text-stone-600">
          {isWinner
            ? "Твой ответ оказался первым и правильным. Архив впечатлён, хотя очень старается этого не показывать."
            : isCorrect
            ? "Попадание! Не первым, зато архив всё равно одобрительно хмыкнул."
            : "Все попытки ушли в архив. Правильный ответ, увы, остался там же."}
        </p>
        {isCorrect && comment ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">{comment}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function QuizGuessButton({
  titleId,
  variant = "detail",
}: {
  titleId: number;
  variant?: "detail" | "preview";
}) {
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [feedback, setFeedback] = useState<ArchiveToast | null>(null);
  const [result, setResult] = useState<QuizGuessResult | null>(null);
  const [resultComment, setResultComment] = useState<string | null>(null);
  const cooldownTimeoutRef = useRef<number | null>(null);
  const { quizParticipant, setQuizParticipant } = useExternalInterface();

  useEffect(() => () => {
    if (cooldownTimeoutRef.current !== null) {
      window.clearTimeout(cooldownTimeoutRef.current);
    }
  }, []);

  async function guess() {
    setPending(true);
    setCooldown(true);
    cooldownTimeoutRef.current = window.setTimeout(() => {
      setCooldown(false);
      cooldownTimeoutRef.current = null;
    }, 3_000);
    setFeedback(null);
    setResultComment(null);
    try {
      const response = await fetch("/quiz/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId }),
      });
      const data = await response.json();
      if (data.participant !== undefined) {
        setQuizParticipant(data.participant as QuizParticipantHudState | null);
      }
      if (response.ok && (data.correct || data.participant?.outcome === "exhausted")) {
        setResultComment(data.correct && typeof data.comment === "string" ? data.comment : null);
        setResult(data.correct
          ? data.participant?.isWinner ? "winner" : "correct"
          : "exhausted");
        return;
      }
      setFeedback({
        id: `quiz-guess-${Date.now()}`,
        tone: "error",
        text: response.ok ? "Неверно" : data.error ?? "Не удалось проверить догадку.",
      });
    } catch {
      setFeedback({
        id: `quiz-guess-${Date.now()}`,
        tone: "error",
        text: "Не удалось проверить догадку.",
      });
    } finally {
      setPending(false);
    }
  }

  const button = (
    <Button
      type="button"
      size="sm"
      variant="positive"
      className={`h-9 border font-mono uppercase tracking-[0.08em] ${AUTHOR_RATING_TONE_CLASS_NAMES.good} hover:border-emerald-950/40 hover:bg-emerald-800 ${variant === "preview" ? "w-full" : "px-4"}`}
      disabled={pending || cooldown}
      onClick={guess}
    >
      {pending ? "Проверяем…" : "Проверить догадку"}
      {pending ? <LoaderCircle className="animate-spin" /> : <CircleHelp />}
    </Button>
  );

  const isQuizCompleted = quizParticipant?.completed === true;

  return (
    <>
      <ArchiveToasts messages={feedback ? [feedback] : []} />
      {result ? (
        <QuizGuessResultModal
          comment={resultComment}
          result={result}
          onClose={() => setResult(null)}
        />
      ) : null}
      {isQuizCompleted ? null : (
        <div className={variant === "preview" ? "w-full" : "flex items-center"}>
          {button}
        </div>
      )}
    </>
  );
}
