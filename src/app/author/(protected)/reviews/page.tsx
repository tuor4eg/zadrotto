import Link from "next/link";
import { Edit3, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationNav } from "@/components/pagination-nav";
import { Tooltip } from "@/components/ui/tooltip";
import { getAuthorReviews } from "@/db/queries/contribution-reviews";
import { getEnabledMediaTypeCodes } from "@/db/queries/media-types";
import { requireAuthor } from "@/lib/auth/author-auth";
import { parsePage } from "@/lib/common/pagination";
import {
  CONTRIBUTION_STATUS_VALUE_LABELS,
  type ContributionStatus,
} from "@/lib/contributions/model";
import { AuthorToasts, type AuthorToast } from "../author-toasts";

type AuthorReviewsPageProps = {
  searchParams: Promise<{
    page?: string;
    published?: string;
    saved?: string;
    submitted?: string;
  }>;
};

const AUTHOR_REVIEWS_PAGE_SIZE = 20;

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

export default async function AuthorReviewsPage({ searchParams }: AuthorReviewsPageProps) {
  const [author, params] = await Promise.all([requireAuthor(), searchParams]);
  const enabledMediaTypeCodes = await getEnabledMediaTypeCodes(author.id);
  const reviewsPage = await getAuthorReviews(
    author.id,
    enabledMediaTypeCodes,
    parsePage(params.page),
    AUTHOR_REVIEWS_PAGE_SIZE,
  );
  const toast: AuthorToast | null =
    params.saved === "1"
      ? { id: "saved", tone: "success", text: "Черновик рецензии сохранен." }
      : params.published === "1"
        ? { id: "published", tone: "success", text: "Рецензия опубликована." }
      : params.submitted === "1"
        ? { id: "submitted", tone: "success", text: "Рецензия отправлена на проверку." }
        : null;
  const description = author.canPublishMediaWithoutReview
    ? "Авторский текст можно публиковать в архиве сразу."
    : "Авторский текст появляется в архиве после проверки админом.";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl leading-none text-stone-950">Мои рецензии</h2>
          <p className="mt-2 text-sm text-stone-600">{description}</p>
        </div>
      </div>

      <AuthorToasts
        clearParams={["saved", "published", "submitted"]}
        messages={toast ? [toast] : []}
      />

      {reviewsPage.totalCount === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-stone-500">
            Рецензий пока нет. Открой запись в архиве и поделись мнением с её страницы.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-2">
            {reviewsPage.items.map((review) => (
              <article
                key={review.id}
                className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="min-w-0 truncate text-sm font-semibold text-stone-950">
                      {review.reviewTitle}
                    </h3>
                    <Badge variant={REVIEW_STATUS_BADGE_VARIANTS[review.status]}>
                      {CONTRIBUTION_STATUS_VALUE_LABELS[review.status]}
                    </Badge>
                    <span className="text-xs text-stone-500">
                      Обновлено: {formatDate(review.updatedAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-stone-600">{review.mediaItemTitle}</p>
                  {review.adminNote ? (
                    <p className="mt-2 rounded-md bg-stone-100 px-2.5 py-1.5 text-xs text-stone-600">
                      {review.adminNote}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1.5 self-center">
                  <Tooltip label="Редактировать">
                    <Link
                      href={`/author/reviews/${review.id}/edit`}
                      className={buttonVariants({ variant: "outline", size: "icon" })}
                      aria-label={`Редактировать рецензию «${review.reviewTitle}»`}
                    >
                      <Edit3 />
                    </Link>
                  </Tooltip>
                  {review.status === "published" ? (
                    <Tooltip label="Показать">
                      <Link
                        href={`/media/${review.mediaItemCode}?review=${review.id}`}
                        className={buttonVariants({ variant: "outline", size: "icon" })}
                        aria-label={`Показать рецензию «${review.reviewTitle}»`}
                      >
                        <Eye />
                      </Link>
                    </Tooltip>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          <PaginationNav
            basePath="/author/reviews"
            itemLabel="рецензий"
            page={reviewsPage.page}
            pageSize={reviewsPage.pageSize}
            searchParams={{}}
            totalCount={reviewsPage.totalCount}
            totalPages={reviewsPage.totalPages}
            variant="archive"
          />
        </>
      )}
    </div>
  );
}
