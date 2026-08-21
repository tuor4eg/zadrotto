"use client";

import { CircleHelp, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import {
  useExternalInterface,
  type QuizParticipantHudState,
} from "@/components/external-interface/external-interface-layer";

export function QuizGuessButton({
  titleId,
  variant = "default",
}: {
  titleId: number;
  variant?: "default" | "icon";
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<ArchiveToast | null>(null);
  const { setQuizParticipant } = useExternalInterface();

  async function guess() {
    setPending(true);
    setFeedback(null);
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
      const text = response.ok
        ? data.correct
          ? "Верно"
          : data.participant?.outcome === "exhausted"
            ? "Неверно. Попытки закончились."
            : "Неверно"
        : data.error ?? "Не удалось проверить догадку.";
      setFeedback({
        id: `quiz-guess-${Date.now()}`,
        tone: response.ok && data.correct ? "success" : "error",
        text,
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
      size={variant === "icon" ? "icon" : "sm"}
      variant={variant === "icon" ? "outline" : "default"}
      disabled={pending}
      aria-label={variant === "icon" ? "Проверить догадку" : undefined}
      onClick={guess}
    >
      {variant === "icon" ? (
        pending ? <LoaderCircle className="animate-spin" /> : <CircleHelp />
      ) : pending ? (
        "Проверяем…"
      ) : (
        "Проверить догадку"
      )}
    </Button>
  );

  return (
    <div className="flex items-center">
      <ArchiveToasts messages={feedback ? [feedback] : []} />
      {variant === "icon" ? (
        <ArchiveTooltip label="Проверить догадку" portal side="top">
          {button}
        </ArchiveTooltip>
      ) : button}
    </div>
  );
}
