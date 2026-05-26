import Link from "next/link";
import { Check, Eye, X } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAdminContributionReviews } from "@/db/queries/contribution-reviews";
import { getAdminFormErrorMessage } from "@/lib/app-error-messages";
import { CONTRIBUTION_STATUS_VALUE_LABELS, type ContributionStatus } from "@/lib/contributions";
import { EmptyState, PageHeader } from "../admin-ui";
import { reviewContributionReviewAction } from "./actions";

type AdminReviewsPageProps = {
  searchParams: Promise<{
    error?: string;
    hidden?: string;
    published?: string;
    rejected?: string;
  }>;
};

const REVIEW_STATUS_BADGE_VARIANTS: Record<ContributionStatus, "default" | "outline" | "positive" | "warning" | "destructive"> = {
  draft: "outline",
  submitted: "warning",
  published: "positive",
  rejected: "destructive",
  hidden: "default",
};

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

export default async function AdminReviewsPage({ searchParams }: AdminReviewsPageProps) {
  const params = await searchParams;
  const reviews = await getAdminContributionReviews({ status: "submitted" });
  const successMessage =
    params.published === "1"
      ? "Рецензия опубликована."
      : params.rejected === "1"
        ? "Рецензия отклонена."
        : params.hidden === "1"
          ? "Рецензия скрыта."
          : null;
  const errorMessage =
    getAdminFormErrorMessage(params.error) ??
    (params.error === "invalid-review" ? "Не удалось обработать рецензию." : null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Заявки на рецензии"
        description="Авторские рецензии, которые ждут проверки перед публикацией."
        aside={<Badge variant="warning">{reviews.length} на проверке</Badge>}
      />

      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      {reviews.length === 0 ? (
        <EmptyState>Заявок на проверку сейчас нет.</EmptyState>
      ) : (
        <TableWrap>
          <Table className="table-fixed">
            <THead>
              <tr>
                <TH className="w-36">Статус</TH>
                <TH>Рецензия</TH>
                <TH className="w-40">Автор</TH>
                <TH className="w-44">Дата</TH>
                <TH className="w-36 text-right">Действия</TH>
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
                    {formatDate(review.submittedAt ?? review.updatedAt)}
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      <Tooltip label="Смотреть">
                        <Link
                          href={`/admin/reviews/${review.id}`}
                          aria-label={`Смотреть заявку ${review.reviewTitle}`}
                          className={buttonVariants({ variant: "outline", size: "icon" })}
                        >
                          <Eye />
                        </Link>
                      </Tooltip>
                      <Tooltip label="Опубликовать">
                        <form action={reviewContributionReviewAction}>
                          <input type="hidden" name="contributionId" value={review.id} />
                          <Button
                            type="submit"
                            name="decision"
                            value="published"
                            variant="positive"
                            size="icon"
                            aria-label="Опубликовать рецензию"
                          >
                            <Check />
                          </Button>
                        </form>
                      </Tooltip>
                      <Tooltip label="Отклонить">
                        <form action={reviewContributionReviewAction}>
                          <input type="hidden" name="contributionId" value={review.id} />
                          <Button
                            type="submit"
                            name="decision"
                            value="rejected"
                            variant="destructive"
                            size="icon"
                            aria-label="Отклонить рецензию"
                          >
                            <X />
                          </Button>
                        </form>
                      </Tooltip>
                    </div>
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
