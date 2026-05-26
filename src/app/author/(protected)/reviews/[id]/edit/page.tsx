import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getAuthorReviewForEdit } from "@/db/queries/contribution-reviews";
import { requireAuthor } from "@/lib/author-auth";
import { getReviewFormErrorMessage } from "@/lib/contribution-review-form";
import {
  CONTRIBUTION_STATUS_VALUE_LABELS,
  isAuthorEditableContributionStatus,
} from "@/lib/contributions";
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
            После отправки текст попадет на проверку.
          </p>
        </div>
        <Badge>{CONTRIBUTION_STATUS_VALUE_LABELS[review.status]}</Badge>
      </div>

      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
      {review.adminNote ? <Alert>{review.adminNote}</Alert> : null}

      {isEditable ? (
        <AuthorReviewForm
          contributionId={review.id}
          mediaItem={{ id: review.mediaItemId, title: review.mediaItemTitle }}
          values={{ title: review.title, body: review.body }}
        />
      ) : (
        <Alert>
          Рецензия уже на проверке. Редактирование откроется после решения админа.
        </Alert>
      )}
    </div>
  );
}
