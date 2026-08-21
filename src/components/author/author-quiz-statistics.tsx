import { Award, CircleCheck, Flame, Gamepad2, Medal, Sparkles, Target } from "lucide-react";

import { AuthorStatisticList } from "@/components/author/author-statistic-list";
import { Card, CardContent } from "@/components/ui/card";
import type { AuthorQuizStatistics as AuthorQuizStatisticsValue } from "@/lib/quizzes/model";

export function AuthorQuizStatistics({ statistics }: { statistics: AuthorQuizStatisticsValue }) {
  const items = [
    { Icon: Gamepad2, label: "Сыграно", value: statistics.playedCount },
    { Icon: CircleCheck, label: "Правильных ответов", value: statistics.correctCount },
    { Icon: Target, label: "Точность", value: `${statistics.accuracyPercent}%` },
    { Icon: Sparkles, label: "С первой попытки", value: statistics.firstTryCorrectCount },
    { Icon: Flame, label: "Текущая серия", value: statistics.currentCorrectStreak },
    { Icon: Award, label: "Лучшая серия", value: statistics.bestCorrectStreak },
    { Icon: Medal, label: "Побед", value: statistics.winnerCount },
  ];

  return (
    <Card className="archive-paper archive-panel">
      <CardContent className="p-4 sm:px-5 sm:pt-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
          <h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
            <Gamepad2 className="size-5 shrink-0 text-red-950/70" />
            Викторины
          </h2>
        </div>
        <AuthorStatisticList items={items} />
      </CardContent>
    </Card>
  );
}
