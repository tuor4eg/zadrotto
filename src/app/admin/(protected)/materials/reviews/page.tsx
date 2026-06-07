import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getAdminContributionReviews } from "@/db/queries/contribution-reviews";
import {
  CONTRIBUTION_STATUS_VALUE_LABELS,
  type ContributionStatus,
} from "@/lib/contributions/model";
import { EmptyState, PageHeader } from "../../admin-ui";

type AdminMaterialReviewsPageProps = {
  searchParams: Promise<{
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
  const status = parseMaterialReviewStatus(params.status);
  const reviews = await getAdminContributionReviews({ status });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Рецензии"
        description="Материалы авторов после модерации."
        aside={<Badge>{reviews.length} в списке</Badge>}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/materials/reviews"
          className={buttonVariants({
            variant: status === "published" ? "default" : "outline",
            size: "sm",
          })}
        >
          Опубликованные
        </Link>
        <Link
          href="/admin/materials/reviews?status=rejected"
          className={buttonVariants({
            variant: status === "rejected" ? "default" : "outline",
            size: "sm",
          })}
        >
          Отклоненные
        </Link>
        <Link
          href="/admin/materials/reviews?status=hidden"
          className={buttonVariants({
            variant: status === "hidden" ? "default" : "outline",
            size: "sm",
          })}
        >
          Скрытые
        </Link>
      </div>

      {reviews.length === 0 ? (
        <EmptyState>Рецензий в этом статусе нет.</EmptyState>
      ) : (
        <TableWrap>
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
      )}
    </div>
  );
}
