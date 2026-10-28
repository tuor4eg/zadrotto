import type { Metadata } from "next";
import Link from "next/link";

import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { PaginationNav } from "@/components/pagination-nav";
import { QuizArchiveList } from "@/components/quizzes/quiz-archive-list";
import { getQuizArchivePage } from "@/db/queries/quizzes";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { requireAuthor } from "@/lib/auth/author-auth";
import { parsePage } from "@/lib/common/pagination";

export const metadata: Metadata = {
  title: "Архив квизов",
  description: "Все завершённые квизы архива.",
};

export const dynamic = "force-dynamic";

export default async function QuizArchivePage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const author = await requireAuthor();
  const params = await searchParams;
  const [headerState, archive] = await Promise.all([
    getPublicSiteHeaderState(author),
    getQuizArchivePage(parsePage(Array.isArray(params.page) ? params.page[0] : params.page)),
  ]);

  return (
    <main className="archive-page flex min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <h1 className="sr-only">Архив квизов</h1>
        <QuizArchiveList
          items={archive.items}
          showAllLink={false}
          breadcrumbs={
            <nav aria-label="Хлебные крошки" className="media-carrier-font-pc-steam text-xs lowercase text-stone-600">
              <Link href="/quizzes" className="hover:text-red-950">Квизы</Link>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">Архив квизов</span>
            </nav>
          }
        />
        <PaginationNav
          basePath="/quizzes/archive"
          itemLabel="квизов"
          page={archive.page}
          pageSize={archive.pageSize}
          searchParams={{}}
          showPageJump
          totalCount={archive.totalCount}
          totalPages={archive.totalPages}
          variant="archive"
        />
      </div>
    </main>
  );
}
