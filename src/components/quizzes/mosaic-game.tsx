"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MosaicCanvas } from "./mosaic-canvas";
import { MosaicPoster } from "./mosaic-poster";
import { QuizParticipationButton } from "./quiz-participation-button";
import { QuizAnswerReveal } from "./quiz-answer-reveal";
import { QuizResult } from "./quiz-result";
import { QuizInlineAnswer } from "./quiz-inline-answer";
import { Button } from "@/components/ui/button";
import { useExternalInterface } from "@/components/external-interface/external-interface-layer";
import type { ActiveQuiz, QuizParticipantState } from "@/lib/quizzes/model";
import type { MosaicAction, MosaicCommand } from "@/lib/quizzes/mosaic";

export function MosaicGame({ quiz, participant: initial, finished, onOpenArchive }: {
  quiz: Extract<ActiveQuiz, { type: "mosaic" }>;
  participant: QuizParticipantState;
  finished: boolean;
  onOpenArchive?: () => void;
}) {
  const [localParticipant, setParticipant] = useState(initial);
  const participant = (initial.revision ?? 0) > (localParticipant.revision ?? 0) ? initial : localParticipant;
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<MosaicCommand | null>(null);
  const [expired, setExpired] = useState(finished);
  const inFlight = useRef(false);
  const router = useRouter();
  const { setQuizParticipant } = useExternalInterface();
  const mosaic = participant.mosaic;
  const completed = participant.completed;
  const disabled = pending || !!retry || completed || expired || !ready;

  useEffect(() => {
    if (finished || completed) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= new Date(quiz.endsAt).getTime()) { setExpired(true); window.clearInterval(timer); router.refresh(); }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [finished, completed, quiz.endsAt, router]);

  async function send(command: MosaicCommand) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/quizzes/${quiz.id}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...command, mechanic: quiz.type }),
      });
      const data = await response.json();
      if (data.participant) { setParticipant(data.participant); setQuizParticipant(data.participant); }
      setRetry(null);
      if (!response.ok) {
        setError(data.error ?? "Не удалось выполнить действие. Состояние обновлено.");
        if (response.status === 404) { setExpired(true); router.refresh(); }
      }
      if (data.participant?.completed) router.refresh();
    } catch {
      setRetry(command);
      setError("Ответ сервера не получен. Повторите запрос — очки повторно не спишутся.");
    } finally { inFlight.current = false; setPending(false); }
  }

  function act(action: MosaicAction) {
    if (disabled || inFlight.current) return;
    if (Date.now() >= new Date(quiz.endsAt).getTime()) { setExpired(true); router.refresh(); return; }
    void send({ ...action, actionId: crypto.randomUUID(), revision: participant.revision ?? 0 });
  }

  if (!mosaic || !quiz.config || !quiz.imageUrl) return <p>Не удалось загрузить мозаику. <button className="underline" onClick={() => router.refresh()}>Обновить</button></p>;

  return <div className="grid w-full min-w-0 justify-items-center gap-4">
    {completed || expired ? <MosaicPoster imageUrl={quiz.imageUrl} /> : <>
      <MosaicCanvas imageUrl={quiz.imageUrl} seed={quiz.config.seed} openedMask={mosaic.openedMask} disabled={disabled} onReady={setReady} onOpen={(cellIndex) => act({ type: "openCell", cellIndex })} />
      <QuizInlineAnswer key={quiz.id} quiz={quiz} participant={participant} disabled={disabled} />
    </>}
    <QuizAnswerReveal quizId={quiz.id} endsAt={quiz.endsAt} solved={completed} />
    {completed ? <QuizResult participant={participant} /> : expired ? <p>Квиз завершён</p> : <QuizParticipationButton isParticipating onOpenArchive={onOpenArchive} />}
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
    {retry ? <Button type="button" disabled={pending} variant="outline" onClick={() => void send(retry)}>Повторить запрос</Button> : null}
  </div>;
}
