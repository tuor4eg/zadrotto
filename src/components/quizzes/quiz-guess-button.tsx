"use client";

import { CircleHelp, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { QuizAnswerReveal } from "./quiz-answer-reveal";
import { LifeLossToast } from "./life-loss-toast";
import { Button } from "@/components/ui/button";
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import {
  useExternalInterface,
  type QuizParticipantHudState,
} from "@/components/external-interface/external-interface-layer";
import { AUTHOR_RATING_TONE_CLASS_NAMES } from "@/lib/ratings/tone";

type QuizGuessResult = "correct" | "exhausted";

function QuizGuessResultModal({
  comment,
  onClose,
  result,
  points,
  mosaicQuizId,
}: {
  comment: string | null;
  onClose: () => void;
  result: QuizGuessResult;
  points: number;
  mosaicQuizId?: number | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isCorrect = result !== "exhausted";

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
        className="archive-paper archive-panel relative max-h-[90dvh] w-full max-w-md overflow-y-auto p-6 text-center shadow-2xl sm:p-8"
      >
        <button
          type="button"
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700"
          style={{ position: "absolute" }}
          aria-label="Закрыть результат квиза"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
        {mosaicQuizId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/quizzes/${mosaicQuizId}/image`} alt="Исходный постер" className="mx-auto mb-4 max-h-[35dvh] max-w-full rounded-md object-contain" />
        ) : isCorrect ? (
          <Image
            alt=""
            className="mx-auto mb-4 h-auto w-40"
            height={460}
            src="/mascot/deadz_quiz_correct.webp"
            unoptimized
            width={420}
          />
        ) : (
          <Image
            alt=""
            className="mx-auto mb-4 h-auto w-40"
            height={525}
            src="/mascot/deadz_quiz_fail.webp"
            unoptimized
            width={420}
          />
        )}
        <h2 id="quiz-guess-result-title" className="font-serif text-3xl">
          {isCorrect ? "Верно!" : mosaicQuizId ? "Жизни закончились" : "Попытки закончились"}
        </h2>
        <p id="quiz-guess-result-description" className="mt-3 text-sm leading-6 text-stone-600">
          {isCorrect
            ? `Правильный ответ! Очков: ${points}.`
            : mosaicQuizId ? "Раунд завершён. Правильный ответ — ниже." : "Все попытки ушли в архив. Правильный ответ, увы, остался там же."}
        </p>
        {mosaicQuizId ? <div className="mt-4"><QuizAnswerReveal quizId={mosaicQuizId} endsAt="1970-01-01T00:00:00.000Z" solved /></div> : null}
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
  participantState,
  disabled = false,
  onPendingChange,
}: {
  titleId: number;
  variant?: "detail" | "preview";
  participantState?: QuizParticipantHudState;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [lifeLoss, setLifeLoss] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [feedback, setFeedback] = useState<ArchiveToast | null>(null);
  const [result, setResult] = useState<QuizGuessResult | null>(null);
  const [resultPoints, setResultPoints] = useState(0);
  const [resultMosaicQuizId, setResultMosaicQuizId] = useState<number | null>(null);
  const requestInFlight = useRef(false);
  const retryRequest = useRef<{ url: string; body: string } | null>(null);
  const [resultComment, setResultComment] = useState<string | null>(null);
  const cooldownTimeoutRef = useRef<number | null>(null);
  const { quizParticipant: hudParticipant, setQuizParticipant } = useExternalInterface();
  const quizParticipant = participantState ?? hudParticipant;

  useEffect(() => {
    if (lifeLoss === null) return;
    const timeout = window.setTimeout(() => setLifeLoss(null), 1_000);
    return () => window.clearTimeout(timeout);
  }, [lifeLoss]);

  useEffect(() => () => {
    if (cooldownTimeoutRef.current !== null) {
      window.clearTimeout(cooldownTimeoutRef.current);
    }
  }, []);

  async function guess() {
    if (requestInFlight.current || disabled) return;
    requestInFlight.current = true;
    setPending(true);
    onPendingChange?.(true);
    setCooldown(true);
    cooldownTimeoutRef.current = window.setTimeout(() => {
      setCooldown(false);
      cooldownTimeoutRef.current = null;
    }, 3_000);
    setFeedback(null);
    setResultComment(null);
    try {
      let participant = quizParticipant;
      if (!participant && !retryRequest.current) {
        const status = await fetch("/api/quizzes/active/status", { cache: "no-store" });
        if (!status.ok) throw new Error("quiz-state-unavailable");
        participant = (await status.json()).participant ?? null;
      }
      const request = retryRequest.current ?? (participant?.type === "mosaic" ? {
        url: `/api/quizzes/${participant.quizId}/actions`,
        body: JSON.stringify({ mechanic: "mosaic", type: "submitAnswer", titleId, actionId: crypto.randomUUID(), revision: participant.revision ?? 0 }),
      } : { url: "/quiz/guess", body: JSON.stringify({ titleId, quizId: participant?.quizId }) });
      // Keep the same action ID after an uncertain network response.
      retryRequest.current = request;
      const response = await fetch(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: request.body,
      });
      const data = await response.json();
      retryRequest.current = null;
      if (data.participant !== undefined) {
        setQuizParticipant(data.participant as QuizParticipantHudState | null);
        router.refresh();
      }
      if (response.ok && data.correct === false && data.participant
        && participant && data.participant.attemptsRemaining < participant.attemptsRemaining) {
        setLifeLoss(Date.now());
      }
      if (response.ok && (data.correct || data.participant?.outcome === "exhausted")) {
        setResultMosaicQuizId(data.participant?.type === "mosaic" ? data.participant.quizId : null);
        setResultPoints(data.participant?.points ?? 0);
        setResultComment(data.correct && typeof data.comment === "string" ? data.comment : null);
        setResult(data.correct
          ? "correct"
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
      requestInFlight.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }

  const button = (
    <Button
      type="button"
      size="sm"
      variant="positive"
      className={`h-9 border font-mono uppercase tracking-[0.08em] ${AUTHOR_RATING_TONE_CLASS_NAMES.good} hover:border-emerald-950/40 hover:bg-emerald-800 ${variant === "preview" ? "w-full" : "px-4"}`}
      disabled={disabled || pending || cooldown}
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
          mosaicQuizId={resultMosaicQuizId}
          result={result}
          points={resultPoints}
          onClose={() => setResult(null)}
        />
      ) : null}
      {isQuizCompleted ? null : (
        <div className={variant === "preview" ? "relative w-full" : "relative flex items-center"}>
          {button}
          {lifeLoss !== null ? <LifeLossToast key={lifeLoss} /> : null}
        </div>
      )}
    </>
  );
}
