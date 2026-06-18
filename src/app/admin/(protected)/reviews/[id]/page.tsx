import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { getSubmittedContributionReviewForAdminView } from "@/db/queries/contribution-reviews";
import { reviewContributionReviewAction } from "../actions";

type AdminReviewRequestPageProps = {
  params: Promise<{
    id: string;
  }>;
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

function ReviewButton({
  contributionId,
  decision,
  children,
}: {
  contributionId: number;
  decision: "published" | "rejected";
  children: React.ReactNode;
}) {
  return (
    <form action={reviewContributionReviewAction}>
      <input type="hidden" name="contributionId" value={contributionId} />
      <Button type="submit" name="decision" value={decision} variant={decision === "published" ? "positive" : "destructive"}>
        {children}
      </Button>
    </form>
  );
}

export default async function AdminReviewRequestPage({ params }: AdminReviewRequestPageProps) {
  const { id } = await params;
  const contributionId = Number(id);

  if (!Number.isInteger(contributionId) || contributionId <= 0) {
    notFound();
  }

  const review = await getSubmittedContributionReviewForAdminView(contributionId);

  if (!review) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/reviews"
          className={`${buttonVariants({ variant: "outline", size: "sm" })} max-sm:hidden`}
        >
          Назад к заявкам
        </Link>
        <ReviewButton contributionId={review.id} decision="published">
          <Check />
          Одобрить
        </ReviewButton>
        <ReviewButton contributionId={review.id} decision="rejected">
          <X />
          Отклонить
        </ReviewButton>
      </div>

      <article className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
          <span>На проверке</span>
          <span>•</span>
          <span>{formatDate(review.submittedAt ?? review.updatedAt)}</span>
        </div>

        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">
          {review.reviewTitle}
        </h2>

        <div className="mt-3 flex flex-wrap gap-3 text-sm text-stone-600">
          <span>
            Автор:{" "}
            <Link
              href={`/admin/authors/${review.authorId}`}
              className="font-medium text-stone-950 underline underline-offset-2"
            >
              {review.authorName}
            </Link>
          </span>
          <span>
            Запись:{" "}
            <Link
              href={`/media/${review.mediaItemCode}`}
              className="font-medium text-stone-950 underline underline-offset-2"
            >
              {review.mediaItemTitle}
            </Link>
          </span>
        </div>

        <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-stone-700">
          {review.reviewBody}
        </p>
      </article>
    </div>
  );
}
