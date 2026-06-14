import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getAuthorOptions } from "@/db/queries/authors";
import { getAdminContributionReviews } from "@/db/queries/contribution-reviews";
import {
  CONTRIBUTION_STATUS_VALUE_LABELS,
  type ContributionStatus,
} from "@/lib/contributions/model";
import { EmptyState, PageHeader } from "../../admin-ui";
import { ReviewFiltersForm } from "./review-filters-form";

type AdminMaterialReviewsPageProps = {
  searchParams: Promise<{
    author?: string;
    status?: string;
  }>;
};

const MATERIAL_REVIEW_STATUSES = ["published", "rejected", "hidden"] as const;
type MaterialReviewStatus = (typeof MATERIAL_REVIEW_STATUSES)[number];

const REVIEW_STATUS_BADGE_VARIANTS: Record<
  ContributionStatus,
  "default" | "outline" | "positive" | "warning" | "destructive"
> = {
  draft: "outline",
  submitted: "warning",
  published: "positive",
  rejected: "destructive",
  hidden: "default",
};

function parseMaterialReviewStatus(value?: string): MaterialReviewStatus {
  return MATERIAL_REVIEW_STATUSES.some((status) => status === value)
    ? (value as MaterialReviewStatus)
    : "published";
}

function parseMaterialReviewAuthorFilter(
  value: string | undefined,
  authors: Array<{ id: number }>,
) {
  if (!value) {
    return null;
  }

  const authorId = Number(value);

  return authors.some((author) => author.id === authorId) ? authorId : null;
}

function formatDate(value: Date | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(value);
}

export default async function AdminMaterialReviewsPage({
  searchParams,
}: AdminMaterialReviewsPageProps) {
  const params = await searchParams;
  const authors = await getAuthorOptions();
  const status = parseMaterialReviewStatus(params.status);
  const authorFilter = parseMaterialReviewAuthorFilter(params.author, authors);
  const reviews = await getAdminContributionReviews({ authorId: authorFilter, status });
  const statusOptions = MATERIAL_REVIEW_STATUSES.map((value) => ({
    value,
    label: CONTRIBUTION_STATUS_VALUE_LABELS[value],
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Рецензии"
        description="Материалы авторов после модерации."
        aside={<Badge>{reviews.length} в списке</Badge>}
      />

      <ReviewFiltersForm
        authorFilter={authorFilter}
        authors={authors}
        status={status}
        statusOptions={statusOptions}
      />

      {reviews.length === 0 ? (
        <EmptyState>Рецензий в этом статусе нет.</EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:hidden">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <Badge variant={REVIEW_STATUS_BADGE_VARIANTS[review.status]}>
                    {CONTRIBUTION_STATUS_VALUE_LABELS[review.status]}
                  </Badge>
                  <div className="shrink-0 text-right text-xs tabular-nums text-stone-500">
                    {formatDate(review.reviewedAt ?? review.updatedAt)}
                  </div>
                </div>

                <div className="mt-3 min-w-0">
                  <Link
                    href={`/media/${review.mediaItemCode}`}
                    className="text-xs font-medium text-stone-500 underline underline-offset-2 transition-colors hover:text-stone-950"
                  >
                    {review.mediaItemTitle}
                  </Link>
                  <h3 className="mt-1 break-words font-semibold leading-5 text-stone-950">
                    {review.reviewTitle}
                  </h3>
                </div>

                <div className="mt-3 border-t border-stone-100 pt-3">
                  <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                    Автор
                  </div>
                  <Link
                    href={`/admin/authors/${review.authorId}`}
                    className="font-medium text-stone-700 underline underline-offset-2 transition-colors hover:text-stone-950"
                  >
                    {review.authorName}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <TableWrap className="hidden sm:block">
            <Table className="table-fixed">
              <THead>
                <tr>
                  <TH className="w-36">Статус</TH>
                  <TH>Рецензия</TH>
                  <TH className="w-40">Автор</TH>
                  <TH className="w-44">Дата</TH>
                </tr>
              </THead>
              <TBody>
                {reviews.map((review) => (
                  <TR key={review.id}>
                    <TD>
                      <Badge variant={REVIEW_STATUS_BADGE_VARIANTS[review.status]}>
                        {CONTRIBUTION_STATUS_VALUE_LABELS[review.status]}
                      </Badge>
                    </TD>
                    <TD className="min-w-0 overflow-hidden">
                      <Link
                        href={`/media/${review.mediaItemCode}`}
                        className="text-xs font-medium text-stone-500 underline underline-offset-2 transition-colors hover:text-stone-950"
                      >
                        {review.mediaItemTitle}
                      </Link>
                      <h3 className="mt-1 truncate font-semibold leading-5 text-stone-950">
                        {review.reviewTitle}
                      </h3>
                    </TD>
                    <TD className="min-w-0 overflow-hidden">
                      <Link
                        href={`/admin/authors/${review.authorId}`}
                        className="block truncate font-medium text-stone-700 underline underline-offset-2 transition-colors hover:text-stone-950"
                      >
                        {review.authorName}
                      </Link>
                    </TD>
                    <TD className="text-xs tabular-nums text-stone-500">
                      {formatDate(review.reviewedAt ?? review.updatedAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </>
      )}
    </div>
  );
}
