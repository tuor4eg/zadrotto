import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BugReportEntityContextRegistration } from "@/components/bug-reports/bug-report-entity-context";
import { getFranchiseByCode, getPublishedFranchiseBranch } from "@/db/queries/franchises";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { formatSeriesCount } from "@/app/series/series-format";
import { SeriesPageHeader } from "../series-page-header";
import {
  ChildSeriesCatalogProvider,
  ChildSeriesGrid,
  ChildSeriesSearch,
} from "./child-series-catalog";

export const dynamic = "force-dynamic";

type ChildSeriesPageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: ChildSeriesPageProps): Promise<Metadata> {
  const { code } = await params;
  const franchise = await getFranchiseByCode(code);

  return franchise ? { title: `Серии внутри — ${franchise.title}` } : {};
}

export default async function ChildSeriesPage({ params }: ChildSeriesPageProps) {
  const { code } = await params;
  const franchise = await getFranchiseByCode(code);

  if (!franchise) notFound();

  const [currentAuthor, currentAdminUser] = await Promise.all([
    getCurrentAuthor(),
    getCurrentAdminUser(),
  ]);
  const mediaTypes = await getEffectiveMediaTypeOptions(currentAuthor?.id);
  const enabledMediaTypeCodes = mediaTypes
    .filter(({ isEnabled }) => isEnabled)
    .map(({ code: mediaTypeCode }) => mediaTypeCode);
  const franchiseBranch = await getPublishedFranchiseBranch(franchise.id, enabledMediaTypeCodes);
  const childSeries = franchiseBranch?.children ?? [];

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <BugReportEntityContextRegistration context={{ entityId: String(franchise.id), entityType: "franchise" }} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <ChildSeriesCatalogProvider series={childSeries}>
          <section className="archive-paper archive-panel archive-stack archive-stack-bottom relative z-10 min-w-0 overflow-visible pt-8">
            <SeriesPageHeader
              adminCanEdit={Boolean(currentAdminUser)}
              franchise={franchise}
              mediaItemsCount={franchiseBranch?.mediaItemsCount ?? 0}
              view="children"
            >
              {childSeries.length > 0 ? <ChildSeriesSearch /> : null}
            </SeriesPageHeader>

            <div className="border-t border-stone-300/80 p-5 sm:p-6" aria-labelledby="child-series-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="child-series-heading" className="font-serif text-3xl leading-none text-stone-950 sm:text-4xl">
                  Серии внутри
                </h2>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-stone-500">
                  {formatSeriesCount(childSeries.length)}
                </p>
              </div>
              <div className="mt-5">
                {childSeries.length > 0 ? (
                  <ChildSeriesGrid />
                ) : (
                  <div className="rounded-md border border-stone-300/80 bg-stone-50/45 p-5 text-sm text-stone-600">
                    В этой серии нет дочерних серий.
                  </div>
                )}
              </div>
            </div>
          </section>
        </ChildSeriesCatalogProvider>
      </div>
    </main>
  );
}
