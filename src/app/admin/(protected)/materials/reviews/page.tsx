import Link from "next/link";
import { Check, EyeOff, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAuthorOptions } from "@/db/queries/authors";
import { getAdminContributionReviews } from "@/db/queries/contribution-reviews";
import { getAdminFormErrorMessage } from "@/lib/common/app-error-messages";
import {
  CONTRIBUTION_STATUS_VALUE_LABELS,
  type ContributionStatus,
} from "@/lib/contributions/model";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import { EmptyState, PageHeader } from "../../admin-ui";
import {
  deleteContributionReviewAction,
  reviewContributionReviewAction,
} from "../../reviews/actions";
import { ReviewFiltersForm } from "./review-filters-form";

type AdminMaterialReviewsPageProps = {
  searchParams: Promise<{
    author?: string;
    deleted?: string;
    error?: string;
    hidden?: string;
    published?: string;
    status?: string;
  }>;
};

const MATERIAL_REVIEW_STATUSES = ["all", "published", "rejected", "hidden"] as const;
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
    : "all";
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

function ReviewMaterialActions({
  redirectTo,
  review,
}: {
  redirectTo: string;
  review: Awaited<ReturnType<typeof getAdminContributionReviews>>[number];
}) {
  const canHide = review.status === "published";
  const canPublish = review.status === "hidden";
  const canChangePublication = canHide || canPublish;
  const canDelete = review.status === "hidden";
  const publicationDecision = canPublish ? "published" : "hidden";
  const publicationLabel = canPublish ? "Опубликовать" : "Снять с публикации";

  return (
    <div className="flex flex-nowrap justify-end gap-1.5">
      <Tooltip
        label={
          canChangePublication
            ? publicationLabel
            : "Действие доступно для опубликованных или скрытых рецензий"
        }
      >
        <form action={reviewContributionReviewAction} className="shrink-0">
          <input type="hidden" name="contributionId" value={review.id} />
          <input type="hidden" name="decision" value={publicationDecision} />
          <input type="hidden" name="redirectScope" value="materials" />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <Button
            type="submit"
            variant={canPublish ? "positive" : "outline"}
            size="icon"
            disabled={!canChangePublication}
            aria-label={`${publicationLabel} рецензию ${review.reviewTitle}`}
          >
            {canPublish ? <Check /> : <EyeOff />}
          </Button>
        </form>
      </Tooltip>
      <Tooltip label={canDelete ? "Удалить" : "Удалить можно только после снятия с публикации"}>
        <ConfirmAction
          action={deleteContributionReviewAction}
          disabled={!canDelete}
          fields={[
            { name: "contributionId", value: review.id },
            { name: "redirectTo", value: redirectTo },
          ]}
          title="Удалить рецензию?"
          description={`Рецензия «${review.reviewTitle}» будет удалена без возможности восстановления.`}
          triggerLabel="Удалить"
          triggerAriaLabel={`Удалить рецензию ${review.reviewTitle}`}
          triggerIcon={<Trash2 />}
          triggerSize="icon"
          confirmLabel="Удалить рецензию"
        />
      </Tooltip>
    </div>
  );
}

function getReviewsRedirectPath(input: {
  authorFilter: number | null;
  status: MaterialReviewStatus;
}) {
  const searchParams = new URLSearchParams();

  if (input.status !== "all") {
    searchParams.set("status", input.status);
  }

  if (input.authorFilter) {
    searchParams.set("author", String(input.authorFilter));
  }

  const query = searchParams.toString();

  return query ? `/admin/materials/reviews?${query}` : "/admin/materials/reviews";
}

export default async function AdminMaterialReviewsPage({
  searchParams,
}: AdminMaterialReviewsPageProps) {
  const params = await searchParams;
  const authors = await getAuthorOptions();
  const status = parseMaterialReviewStatus(params.status);
  const authorFilter = parseMaterialReviewAuthorFilter(params.author, authors);
  const reviews = await getAdminContributionReviews({ authorId: authorFilter, status });
  const reviewsRedirectPath = getReviewsRedirectPath({ authorFilter, status });
  const statusOptions = MATERIAL_REVIEW_STATUSES.map((value) => ({
    value,
    label: value === "all" ? "Все рецензии" : CONTRIBUTION_STATUS_VALUE_LABELS[value],
  }));
  const successMessage =
    params.hidden === "1"
      ? "Рецензия снята с публикации."
      : params.published === "1"
        ? "Рецензия опубликована."
        : params.deleted === "1"
          ? "Рецензия удалена."
          : null;
  const errorMessage =
    getAdminFormErrorMessage(params.error) ??
    (params.error === "invalid-review"
      ? "Не удалось обработать рецензию."
      : params.error === "delete-hidden-only"
        ? "Удалить можно только рецензию, снятую с публикации."
        : null);
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts
        clearParams={["deleted", "error", "hidden", "published"]}
        messages={toastMessages}
      />

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

                <div className="mt-4 border-t border-stone-100 pt-3">
                  <ReviewMaterialActions redirectTo={reviewsRedirectPath} review={review} />
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
                  <TH className="w-28 px-2 text-right">Действия</TH>
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
                    <TD className="px-2">
                      <ReviewMaterialActions redirectTo={reviewsRedirectPath} review={review} />
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
