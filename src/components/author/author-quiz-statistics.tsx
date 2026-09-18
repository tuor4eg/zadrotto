import { Award, CircleCheck, Clock3, Gamepad2, Sparkles, Target } from "lucide-react";

import { AuthorStatisticList } from "@/components/author/author-statistic-list";
import { QuizEmptyState } from "@/components/quizzes/quiz-empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { formatQuizDuration, type AuthorQuizStatistics as AuthorQuizStatisticsValue } from "@/lib/quizzes/model";

export function AuthorQuizStatistics({ statistics }: { statistics: AuthorQuizStatisticsValue }) {
  const items = [
    { Icon: CircleCheck, label: "Правильных ответов", value: statistics.correctCount },
    { Icon: Target, label: "Точность", value: `${statistics.accuracyPercent}%` },
    { Icon: Sparkles, label: "С первой попытки", value: statistics.firstTryCorrectCount },
    { Icon: Award, label: "Лучшая серия", value: statistics.bestCorrectStreak },
    { Icon: Clock3, label: "Общее время", value: formatQuizDuration(statistics.totalTimeSeconds) },
  ];

  return (
    <Card className="archive-paper archive-panel h-full">
      <CardContent className="h-full p-4 sm:px-5 sm:pt-5">
        <div className="flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
          <h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
            <Gamepad2 className="size-5 shrink-0 text-red-950/70" />
            Твоя статистика
          </h2>
        </div>
        {statistics.playedCount === 0 ? (
          <QuizEmptyState
            imageSrc="/quiz_stat_placeholder.webp"
            title={
              <>
                Пройди первый квиз —<br />
                здесь появится твоя статистика
              </>
            }
            description={
              <>
                Сколько знаний в твоём инвентаре?<br />
                Скоро узнаем!
              </>
            }
          />
        ) : (
          <div className="mt-4">
            <AuthorStatisticList items={items} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
