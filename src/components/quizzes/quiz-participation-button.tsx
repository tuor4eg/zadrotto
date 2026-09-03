"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  useExternalInterface,
  type QuizParticipantHudState,
} from "@/components/external-interface/external-interface-layer";

export function useQuizParticipation({
  isParticipating,
  onOpenArchive,
}: {
  isParticipating: boolean;
  onOpenArchive?: () => void;
}) {
  const router = useRouter();
  const { setQuizParticipant } = useExternalInterface();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openArchive = useCallback(async () => {
    if (pending) return;

    if (isParticipating) {
      if (onOpenArchive) onOpenArchive();
      else router.push("/archive");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/quizzes/active/participation", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Не удалось присоединиться к викторине.");
        return;
      }
      setQuizParticipant((data as { participant?: QuizParticipantHudState }).participant ?? null);
      if (onOpenArchive) onOpenArchive();
      else router.push("/archive");
      router.refresh();
    } catch {
      setError("Не удалось присоединиться к викторине.");
    } finally {
      setPending(false);
    }
  }, [isParticipating, onOpenArchive, pending, router, setQuizParticipant]);

  return { error, openArchive, pending };
}

export function QuizParticipationButton({
  className,
  idleLabel = "Искать ответ в архиве",
  isParticipating,
  onOpenArchive,
  participatingLabel = "Продолжить поиск в архиве",
}: {
  className?: string;
  idleLabel?: string;
  isParticipating: boolean;
  onOpenArchive?: () => void;
  participatingLabel?: string;
}) {
  const { error, openArchive, pending } = useQuizParticipation({
    isParticipating,
    onOpenArchive,
  });

  return (
    <div className="grid justify-items-center gap-2 text-center">
      <Button className={className ?? "archive-control-surface border-stone-300/80 font-mono text-xs uppercase tracking-wider text-stone-700 transition-colors hover:border-stone-700 hover:bg-stone-50 hover:text-stone-950"} type="button" variant="outline" disabled={pending} onClick={() => void openArchive()}>
        {pending
          ? "Присоединяем…"
          : isParticipating
            ? participatingLabel
            : idleLabel}
      </Button>
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
