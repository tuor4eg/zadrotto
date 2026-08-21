"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  useExternalInterface,
  type QuizParticipantHudState,
} from "@/components/external-interface/external-interface-layer";

export function QuizParticipationButton({
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

  async function openArchive() {
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
  }

  return (
    <div className="grid justify-items-center gap-2 text-center">
      <Button className="archive-control-surface border-stone-300/80 font-mono text-xs uppercase tracking-wider text-stone-700 transition-colors hover:border-stone-700 hover:bg-stone-50 hover:text-stone-950" type="button" variant="outline" disabled={pending} onClick={openArchive}>
        {pending
          ? "Присоединяем…"
          : isParticipating
            ? "Продолжить поиск в архиве"
            : "Искать ответ в архиве"}
      </Button>
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
