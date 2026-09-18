import { Trophy } from "lucide-react";
import Link from "next/link";

import { QuizEmptyState } from "@/components/quizzes/quiz-empty-state";
import { Avatar } from "@/components/ui/avatar";
import type { getQuizLeaderboard } from "@/db/queries/quizzes";
import { formatQuizDuration } from "@/lib/quizzes/model";

type QuizLeaderboardItem = Awaited<ReturnType<typeof getQuizLeaderboard>>[number];

export function QuizLeaderboard({ items }: { items: QuizLeaderboardItem[] }) {
  return (
    <section
      className="archive-paper archive-panel h-full min-h-80 p-4 sm:p-5"
      aria-labelledby="quiz-leaderboard-title"
    >
      <h2
        id="quiz-leaderboard-title"
        className="flex items-center gap-2 border-b border-stone-400/25 pb-3 font-serif text-xl leading-none sm:text-2xl"
      >
        <Trophy className="size-5 shrink-0 text-red-950/70" aria-hidden="true" />
        Таблица победителей
      </h2>

      {items.length > 0 ? (
        <table className="mt-3 w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="font-mono text-[8px] uppercase tracking-[0.1em] text-stone-500 sm:text-[9px]">
              <th className="w-8 pb-2 font-normal">#</th>
              <th className="pb-2 font-normal">Пользователь</th>
              <th className="w-16 pb-2 text-center font-normal">Результат</th>
              <th className="w-36 pb-2 text-right font-normal">Время</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-stone-400/35">
            {items.map((item, index) => (
              <tr key={item.authorId}>
                <td className="py-2 font-mono text-xs tabular-nums text-stone-600">
                  {index + 1}
                </td>
                <td className="min-w-0 py-2 pr-2">
                  <Link
                    href={`/users/${item.authorId}`}
                    className="flex min-w-0 items-center gap-2 hover:text-red-950"
                  >
                    <Avatar
                      name={item.authorName}
                      objectKey={item.authorAvatarObjectKey}
                      className="size-8 text-[10px]"
                    />
                    <span className="truncate font-serif text-sm sm:text-base">{item.authorName}</span>
                  </Link>
                </td>
                <td className="py-2 text-center font-serif text-lg font-semibold tabular-nums text-stone-950">
                  {item.winnerCount}
                </td>
                <td className="whitespace-nowrap py-2 text-right font-mono text-[10px] tabular-nums text-stone-600 sm:text-xs">
                  {formatQuizDuration(item.totalTimeSeconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <QuizEmptyState
          imageSrc="/quiz_win_placeholder.webp"
          title="Пьедестал пока пустует"
          description={
            <>
              Стань одним из первых, кто пройдёт квиз,<br />
              и попади в таблицу лучших!<br />
              Всё только начинается
            </>
          }
        />
      )}
    </section>
  );
}
