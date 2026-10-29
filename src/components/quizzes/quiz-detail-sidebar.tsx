import { ChartNoAxesColumnIncreasing, Target, Trophy, Users } from "lucide-react";
import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import { Avatar } from "@/components/ui/avatar";
import type { getAdminQuizAggregates, getAdminQuizParticipantPage } from "@/db/queries/quizzes";
import { formatQuizDuration } from "@/lib/quizzes/model";

export function QuizDetailSidebar({ quizId, statistics, participants }: {
  quizId: number;
  statistics: Awaited<ReturnType<typeof getAdminQuizAggregates>>;
  participants: Awaited<ReturnType<typeof getAdminQuizParticipantPage>>;
}) {
  const metrics = [
    { Icon: Users, label: "Участников", value: statistics.totalCount.toLocaleString("ru-RU") },
    { Icon: Trophy, label: "Средний балл", value: statistics.averagePoints === null ? "—" : statistics.averagePoints.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) },
    { Icon: Target, label: "Правильных ответов", value: statistics.totalCount ? `${Math.round(statistics.correctCount / statistics.totalCount * 100)}%` : "—" },
  ];

  return (
    <aside className="media-carrier-font-pc-steam grid min-h-0 gap-3 lg:grid-rows-[auto_minmax(0,1fr)]">
      <section className="archive-paper archive-panel flex min-h-0 flex-col p-4 sm:p-5" aria-labelledby="quiz-statistics-title">
        <h2 id="quiz-statistics-title" className="flex items-center gap-2 border-b border-stone-400/25 pb-3 text-xl leading-none sm:text-2xl">
          <ChartNoAxesColumnIncreasing aria-hidden="true" className="size-5 shrink-0 text-red-950/70" />
          Статистика квиза
        </h2>
        <dl className="grid grid-cols-3 divide-x divide-dashed divide-stone-400/25 py-4">
          {metrics.map(({ Icon, label, value }) => (
            <div key={label} className="flex min-w-0 flex-col items-center px-2 text-center">
              <Icon aria-hidden="true" className="mb-2 size-6 text-red-950/65" />
              <dt className="order-2 mt-1 text-xs leading-snug text-stone-600 sm:text-sm">{label}</dt>
              <dd className="text-2xl font-semibold leading-none tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="archive-paper archive-panel flex min-h-0 flex-col p-4 sm:p-5" aria-labelledby="quiz-participants-title">
        <h2 id="quiz-participants-title" className="flex items-center gap-2 border-b border-stone-400/25 pb-3 text-xl leading-none sm:text-2xl">
          <Trophy aria-hidden="true" className="size-5 shrink-0 text-red-950/70" />
          Таблица участников
        </h2>
        {participants.items.length ? (
          <>
            <div className="min-h-0 overflow-y-auto">
              <table className="mt-3 w-full table-fixed text-left">
                <thead className="text-[9px] uppercase tracking-wider text-stone-500">
                  <tr><th className="w-6 pb-2 font-normal">#</th><th className="pb-2 font-normal">Пользователь</th><th className="w-12 pb-2 text-center font-normal">Очки</th><th className="w-24 pb-2 text-right font-normal">Время</th></tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-stone-400/30">
                  {participants.items.map((item, index) => (
                    <tr key={item.authorId}>
                      <td className="py-2 text-xs text-stone-500">{(participants.page - 1) * participants.pageSize + index + 1}</td>
                      <td className="py-2 pr-2">
                        <Link href={`/users/${item.authorId}`} className="flex min-w-0 items-center gap-2 hover:text-red-950">
                          <Avatar name={item.authorName} objectKey={item.authorAvatarObjectKey} className="size-7 shrink-0 text-[10px]" />
                          <span className="truncate text-sm">{item.authorName}</span>
                        </Link>
                      </td>
                      <td className="py-2 text-center font-semibold tabular-nums">{item.points}</td>
                      <td className="py-2 text-right text-[10px] tabular-nums text-stone-600">{formatQuizDuration(item.outcome === "correct" ? item.secondsSinceQuizStart : null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-auto shrink-0 pt-3">
              <PaginationNav basePath={`/quizzes/${quizId}`} itemLabel="участников" page={participants.page} pageSize={participants.pageSize} searchParams={{}} totalCount={participants.totalCount} totalPages={participants.totalPages} variant="archive" />
            </div>
          </>
        ) : <p className="my-auto py-6 text-center text-sm text-stone-600">В этом квизе пока нет участников</p>}
      </section>
    </aside>
  );
}
