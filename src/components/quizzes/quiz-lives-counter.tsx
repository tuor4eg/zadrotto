import { Heart } from "lucide-react";
import type { QuizParticipantState } from "@/lib/quizzes/model";

export function QuizLivesCounter({ participant }: { participant: QuizParticipantState }) {
  return <div
    className="archive-paper-surface pointer-events-auto flex items-center gap-1 rounded-full border border-red-900/25 bg-stone-50/90 px-3 py-2 shadow-[0_10px_24px_rgba(28,25,23,0.2)] backdrop-blur-sm"
    role="status"
    aria-label={`Осталось ${participant.type === "mosaic" ? "очков" : "попыток"}: ${participant.attemptsRemaining} из ${participant.attemptLimit}`}
  >
    <Heart aria-hidden="true" className="size-5 shrink-0 fill-red-700 text-red-800 drop-shadow-sm" />
    <span aria-hidden="true" className="whitespace-nowrap font-medium tabular-nums text-red-900">× {participant.attemptsRemaining}</span>
  </div>;
}
