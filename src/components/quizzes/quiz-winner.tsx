import { Avatar } from "@/components/ui/avatar";
import type { ActiveQuiz } from "@/lib/quizzes/model";

export function QuizWinner({ winner }: { winner: NonNullable<ActiveQuiz["winner"]> }) {
  return (
    <div className="flex items-center justify-center gap-2 text-center">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-stone-600">
        Есть победитель!
      </span>
      <Avatar name={winner.name} objectKey={winner.avatarObjectKey} className="size-7 text-[9px]" />
      <span className="max-w-36 truncate font-serif text-sm text-stone-900">{winner.name}</span>
    </div>
  );
}
