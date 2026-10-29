import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { BugReportEntityContextRegistration } from "@/components/bug-reports/bug-report-entity-context";
import { QuizDetailContent } from "@/components/quizzes/quiz-detail-content";
import { getQuizById, getAdminQuizAggregates, getAdminQuizParticipantPage, getAdjacentQuizzes } from "@/db/queries/quizzes";
import { QuizDetailSidebar } from "@/components/quizzes/quiz-detail-sidebar";
import { parsePage } from "@/lib/common/pagination";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { requireAuthor } from "@/lib/auth/author-auth";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";

export const metadata: Metadata = { title: "Квиз" };
export const dynamic = "force-dynamic";

export default async function QuizPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const author = await requireAuthor();
  const { id } = await params;
  const quizId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(quizId) || quizId < 1 || quizId > 2_147_483_647) notFound();
  const detail = await getQuizById(quizId, author.id);
  if (!detail) notFound();
  const [headerState, statistics, filters, mediaTypes, adjacent] = await Promise.all([
    getPublicSiteHeaderState(author), getAdminQuizAggregates(quizId), searchParams,
    getEffectiveMediaTypeOptions(author.id),
    getAdjacentQuizzes(new Date(detail.quiz.endsAt), quizId),
  ]);
  const participants = await getAdminQuizParticipantPage({
    quizId,
    requestedPage: parsePage(Array.isArray(filters.page) ? filters.page[0] : filters.page),
    totalCount: statistics.totalCount,
  });

  return (
    <main className="archive-page quiz-detail-page flex min-h-0 px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex min-h-0 w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <BugReportEntityContextRegistration context={{ entityId: String(quizId), entityType: "quiz" }} />
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">
          <section className="archive-paper archive-panel grid min-h-[600px] w-full grid-rows-[auto_minmax(0,1fr)] gap-3 p-5 sm:p-8 lg:col-span-2 lg:min-h-0" aria-labelledby="quiz-title">
            <nav aria-label="Хлебные крошки" className="media-carrier-font-pc-steam mb-2 text-xs lowercase text-stone-600">
              <Link href="/quizzes" className="hover:text-red-950">Квизы</Link>
              <span aria-hidden="true"> / </span>
              <Link href="/quizzes/archive" className="hover:text-red-950">Архив квизов</Link>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">Квиз №{quizId}</span>
            </nav>
            <QuizDetailContent
              finished={detail.finished}
              adjacent={adjacent}
              participant={detail.participant}
              quiz={detail.quiz}
              unavailableMediaTypeNames={mediaTypes.filter(({ code, isEnabled }) => !isEnabled && (
                detail.quiz.mediaTypes.length === 0 || detail.quiz.mediaTypes.includes(code)
              )).map(({ name }) => name)}
            />
          </section>
          <QuizDetailSidebar quizId={quizId} statistics={statistics} participants={participants} />
        </div>
      </div>
    </main>
  );
}
