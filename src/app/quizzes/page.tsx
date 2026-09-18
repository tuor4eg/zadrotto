import type { Metadata } from "next";

import { AuthorQuizStatistics } from "@/components/author/author-quiz-statistics";
import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { QuizArchiveList } from "@/components/quizzes/quiz-archive-list";
import { QuizzesHero } from "@/components/quizzes/quizzes-hero";
import { QuizLeaderboard } from "@/components/quizzes/quiz-leaderboard";
import { getAuthorQuizStatistics, getQuizArchive, getQuizLeaderboard } from "@/db/queries/quizzes";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { requireAuthor } from "@/lib/auth/author-auth";

import { ArchiveRiddle } from "../main/archive-riddle";

export const metadata: Metadata = {
  title: "Квизы",
  description: "Текущий квиз архива.",
};

export const dynamic = "force-dynamic";

export default async function QuizzesPage() {
  const author = await requireAuthor();
  const [headerState, statistics, leaderboard, archiveItems] = await Promise.all([
    getPublicSiteHeaderState(author),
    getAuthorQuizStatistics(author.id),
    getQuizLeaderboard(),
    getQuizArchive(),
  ]);
  const { activeQuiz, activeQuizParticipant } = headerState;

  return (
    <main className="archive-page flex min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <QuizzesHero statistics={statistics} />
          </div>
          <ArchiveRiddle
            authenticated
            isCompleted={activeQuizParticipant?.completed === true}
            isParticipating={activeQuizParticipant?.quizId === activeQuiz?.id}
            quiz={activeQuiz}
            size="large"
          />
        </div>
        <div className="grid flex-1 items-stretch gap-3 lg:grid-cols-3">
          <AuthorQuizStatistics statistics={statistics} />
          <QuizLeaderboard items={leaderboard} />
          <QuizArchiveList items={archiveItems} />
        </div>
      </div>
    </main>
  );
}
