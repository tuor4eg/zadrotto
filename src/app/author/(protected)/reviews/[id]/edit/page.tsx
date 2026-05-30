import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getAuthorReviewForEdit } from "@/db/queries/contribution-reviews";
import { requireAuthor } from "@/lib/author-auth";
import { getReviewFormErrorMessage } from "@/lib/contribution-review-form";
import {
  CONTRIBUTION_STATUS_VALUE_LABELS,
  isAuthorEditableContributionStatus,
} from "@/lib/contributions";
import { AuthorToasts } from "../../../author-toasts";
import { AuthorReviewForm } from "../../review-form";

type EditAuthorReviewPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function EditAuthorReviewPage({
  params,
  searchParams,
}: EditAuthorReviewPageProps) {
  const [{ id }, author, query] = await Promise.all([params, requireAuthor(), searchParams]);
  const contributionId = Number(id);

  if (!Number.isInteger(contributionId) || contributionId <= 0) {
    notFound();
  }

  const review = await getAuthorReviewForEdit(author.id, contributionId);

  if (!review) {
    notFound();
  }

  const errorMessage = getReviewFormErrorMessage(query.error);
  const isEditable = isAuthorEditableContributionStatus(review.status);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl leading-none text-stone-950">Рецензия</h2>
          <p className="mt-2 text-sm text-stone-600">
            {author.canPublishMediaWithoutReview
              ? "Изменения можно сразу опубликовать в архиве."
              : "После отправки текст попадет на проверку."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/author/reviews"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Назад к рецензиям
          </Link>
          <Badge>{CONTRIBUTION_STATUS_VALUE_LABELS[review.status]}</Badge>
        </div>
      </div>

      <AuthorToasts
        clearParams={["error"]}
        messages={
          errorMessage
            ? [{ id: query.error ?? "review-error", tone: "error", text: errorMessage }]
            : []
        }
      />
      {review.adminNote ? <Alert>{review.adminNote}</Alert> : null}

      {isEditable ? (
        <AuthorReviewForm
          canPublishWithoutReview={author.canPublishMediaWithoutReview}
          contributionId={review.id}
          mediaItem={{ id: review.mediaItemId, title: review.mediaItemTitle }}
          status={review.status}
          values={{ title: review.title, body: review.body }}
        />
      ) : (
        <Alert>
          {author.canPublishMediaWithoutReview
            ? "Рецензия сейчас недоступна для редактирования."
            : "Рецензия уже на проверке. Редактирование откроется после решения админа."}
        </Alert>
      )}
    </div>
  );
}
