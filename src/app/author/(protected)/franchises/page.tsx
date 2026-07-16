import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationNav } from "@/components/pagination-nav";
import { getAuthorFranchiseSubmissions } from "@/db/queries/franchises";
import { requireAuthor } from "@/lib/auth/author-auth";
import {
  filterAuthorFranchiseSubmissions,
  parseAuthorFranchiseSubmissionStatusFilter,
} from "@/lib/authors/franchise-submission-filters";
import { clampPage, getOffset, getTotalPages, parsePage, parsePageSize } from "@/lib/common/pagination";
import {
  PUBLISHED_PUBLICATION_STATUS,
  type PublicationStatus,
} from "@/lib/media/publication-status";
import { AuthorFranchiseFiltersForm } from "./author-franchise-filters-form";

const AUTHOR_FRANCHISE_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
const DEFAULT_AUTHOR_FRANCHISE_PAGE_SIZE = 24;

const STATUS_BADGE_VARIANTS: Record<
  PublicationStatus,
  "default" | "outline" | "positive" | "warning" | "destructive"
> = {
  private: "outline",
  submitted: "warning",
  published: "positive",
  rejected: "destructive",
};

const STATUS_VALUE_LABELS: Record<PublicationStatus, string> = {
  private: "Черновик",
  submitted: "На проверке",
  published: "Опубликовано",
  rejected: "Отклонено",
};

type AuthorFranchisesPageProps = {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    q?: string;
    status?: string;
  }>;
};

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function PublicFranchiseName({
  code,
  isPublished,
  title,
}: {
  code: string;
  isPublished: boolean;
  title: string;
}) {
  return isPublished ? (
    <Link href={`/franchises/${code}`} className="underline decoration-stone-300 underline-offset-2 hover:decoration-stone-950">
      {title}
    </Link>
  ) : (
    <>{title}</>
  );
}

function PublicMediaItemName({
  code,
  isPublished,
  title,
}: {
  code: string;
  isPublished: boolean;
  title: string;
}) {
  return isPublished ? (
    <Link href={`/media/${code}`} className="underline decoration-stone-300 underline-offset-2 hover:decoration-stone-950">
      {title}
    </Link>
  ) : (
    <>{title}</>
  );
}

export default async function AuthorFranchisesPage({ searchParams }: AuthorFranchisesPageProps) {
  const [author, params] = await Promise.all([requireAuthor(), searchParams]);
  const items = await getAuthorFranchiseSubmissions(author.id);
  const searchQuery = params.q?.trim() ?? "";
  const statusFilter = parseAuthorFranchiseSubmissionStatusFilter(params.status);
  const pageSize = parsePageSize(
    params.pageSize,
    AUTHOR_FRANCHISE_PAGE_SIZE_OPTIONS,
    DEFAULT_AUTHOR_FRANCHISE_PAGE_SIZE,
  );
  const visibleItems = filterAuthorFranchiseSubmissions(items, { searchQuery, status: statusFilter });
  const totalPages = getTotalPages(visibleItems.length, pageSize);
  const page = clampPage(parsePage(params.page), totalPages);
  const paginatedItems = visibleItems.slice(
    getOffset(page, pageSize),
    getOffset(page, pageSize) + pageSize,
  );
  const hasActiveFilters = Boolean(searchQuery) || statusFilter !== "all";
  const paginationSearchParams = {
    pageSize: pageSize !== DEFAULT_AUTHOR_FRANCHISE_PAGE_SIZE ? String(pageSize) : undefined,
    q: searchQuery || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl leading-none text-stone-950">Серии</h2>
          <p className="mt-2 text-sm text-stone-600">
            История предложенных серий и их привязок к тайтлам.
          </p>
        </div>
        <Badge variant="outline">{items.length} всего</Badge>
      </div>

      {items.length > 0 ? (
        <AuthorFranchiseFiltersForm searchQuery={searchQuery} statusFilter={statusFilter} />
      ) : null}

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-stone-500">
            Пока нет предложений по сериям.
          </CardContent>
        </Card>
      ) : visibleItems.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-stone-500">
            {hasActiveFilters ? "По этим фильтрам предложений нет." : "Предложений нет."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3">
            {paginatedItems.map((item) => {
              const isLink = item.kind !== "franchise";
              const isNewFranchiseLink = item.kind === "new-franchise-link";
              const isPublicFranchise =
                (isLink ? item.franchisePublicationStatus : item.publicationStatus) ===
                PUBLISHED_PUBLICATION_STATUS;
              const isPublicMediaItem =
                isLink && item.mediaItemPublicationStatus === PUBLISHED_PUBLICATION_STATUS;

              return (
                <div
                  key={isLink ? `${item.id}-${item.franchiseId}` : item.id}
                  className="rounded-lg border border-stone-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {isNewFranchiseLink ? "Новая серия" : isLink ? "Привязка серии" : "Новая серия"}
                    </Badge>
                    <Badge variant={STATUS_BADGE_VARIANTS[item.publicationStatus]}>
                      {STATUS_VALUE_LABELS[item.publicationStatus]}
                    </Badge>
                    <span className="text-xs text-stone-500">
                      Предложено: {formatDate(item.createdAt)}
                    </span>
                    {item.updatedAt.getTime() !== item.createdAt.getTime() ? (
                      <span className="text-xs text-stone-500">
                        Обновлено: {formatDate(item.updatedAt)}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-2 text-base font-semibold text-stone-950">
                    {isLink ? (
                      <>
                        <PublicMediaItemName
                          code={item.mediaItemCode}
                          isPublished={isPublicMediaItem}
                          title={item.mediaItemTitle}
                        />
                        <span className="px-1.5 text-stone-400">→</span>
                      </>
                    ) : null}
                    <PublicFranchiseName
                      code={item.franchiseCode}
                      isPublished={isPublicFranchise}
                      title={item.franchiseTitle}
                    />
                  </h3>
                  {item.franchiseOriginalTitle ? (
                    <p className="mt-1 text-sm text-stone-600">{item.franchiseOriginalTitle}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <PaginationNav
            basePath="/author/franchises"
            itemLabel="заявок"
            page={page}
            pageSize={pageSize}
            pageSizeOptions={AUTHOR_FRANCHISE_PAGE_SIZE_OPTIONS}
            searchParams={paginationSearchParams}
            totalCount={visibleItems.length}
            totalPages={totalPages}
            variant="archive"
          />
        </>
      )}
    </div>
  );
}
