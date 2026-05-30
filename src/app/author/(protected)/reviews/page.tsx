import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthorReviews } from "@/db/queries/contribution-reviews";
import { requireAuthor } from "@/lib/author-auth";
import {
  CONTRIBUTION_STATUS_VALUE_LABELS,
  type ContributionStatus,
} from "@/lib/contributions";
import { AuthorToasts, type AuthorToast } from "../author-toasts";

type AuthorReviewsPageProps = {
  searchParams: Promise<{
    published?: string;
    saved?: string;
    submitted?: string;
  }>;
};

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
  const reviews = await getAuthorReviews(author.id);
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

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-stone-500">
            Рецензий пока нет. Открой запись в архиве и поделись мнением со страницы тайтла.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {reviews.map((review) => (
            <Link
              key={review.id}
              href={`/author/reviews/${review.id}/edit`}
              className="rounded-lg border border-stone-200 bg-white p-4 transition-colors hover:bg-stone-50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={REVIEW_STATUS_BADGE_VARIANTS[review.status]}>
                  {CONTRIBUTION_STATUS_VALUE_LABELS[review.status]}
                </Badge>
                <span className="text-xs text-stone-500">
                  Обновлено: {formatDate(review.updatedAt)}
                </span>
              </div>
              <h3 className="mt-2 text-base font-semibold text-stone-950">
                {review.reviewTitle}
              </h3>
              <p className="mt-1 text-sm text-stone-600">{review.mediaItemTitle}</p>
              {review.adminNote ? (
                <p className="mt-3 rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-600">
                  {review.adminNote}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
