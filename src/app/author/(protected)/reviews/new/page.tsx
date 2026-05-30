import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import {
  getAuthorReviewForMediaItem,
  getPublishedMediaItemForReview,
  searchPublishedMediaItemsForReview,
} from "@/db/queries/contribution-reviews";
import { requireAuthor } from "@/lib/author-auth";
import { getReviewFormErrorMessage } from "@/lib/contribution-review-form";
import { AuthorToasts } from "../../author-toasts";
import { AuthorReviewForm } from "../review-form";

type NewAuthorReviewPageProps = {
  searchParams: Promise<{
    error?: string;
    mediaItemId?: string;
    q?: string;
  }>;
};

function parsePositiveInteger(value?: string) {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

export default async function NewAuthorReviewPage({ searchParams }: NewAuthorReviewPageProps) {
  const [author, params] = await Promise.all([requireAuthor(), searchParams]);
  const mediaItemId = parsePositiveInteger(params.mediaItemId);
  const query = params.q?.trim() ?? "";
  const errorMessage = getReviewFormErrorMessage(params.error);

  if (mediaItemId) {
    const [mediaItem, existingReview] = await Promise.all([
      getPublishedMediaItemForReview(mediaItemId),
      getAuthorReviewForMediaItem(author.id, mediaItemId),
    ]);

    if (!mediaItem) {
      redirect("/author/reviews/new?error=not-found");
    }

    if (existingReview) {
      redirect(`/author/reviews/${existingReview.id}/edit`);
    }

    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-3xl leading-none text-stone-950">Новая рецензия</h2>
            <p className="mt-2 text-sm text-stone-600">
              {author.canPublishMediaWithoutReview
                ? "Рецензия сразу появится в архиве."
                : "Рецензия станет публичной после проверки."}
            </p>
          </div>
          <Link
            href="/author/reviews"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Назад к рецензиям
          </Link>
        </div>
        <AuthorToasts
          clearParams={["error"]}
          messages={
            errorMessage
              ? [{ id: params.error ?? "review-error", tone: "error", text: errorMessage }]
              : []
          }
        />
        <AuthorReviewForm
          canPublishWithoutReview={author.canPublishMediaWithoutReview}
          mediaItem={mediaItem}
        />
      </div>
    );
  }

  const items = await searchPublishedMediaItemsForReview(query);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl leading-none text-stone-950">Выбери запись</h2>
          <p className="mt-2 text-sm text-stone-600">
            Найди публичную запись архива, к которой хочешь написать рецензию.
          </p>
        </div>
        <Link
          href="/author/reviews"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Назад к рецензиям
        </Link>
      </div>
      <AuthorToasts
        clearParams={["error"]}
        messages={
          errorMessage
            ? [{ id: params.error ?? "review-error", tone: "error", text: errorMessage }]
            : []
        }
      />

      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input name="q" defaultValue={query} placeholder="Название или код записи" />
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Найти
        </button>
      </form>

      <div className="grid gap-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/author/reviews/new?mediaItemId=${item.id}`}
            className="rounded-md border border-stone-200 bg-white px-4 py-3 transition-colors hover:bg-stone-50"
          >
            <span className="block font-medium text-stone-950">{item.title}</span>
            <span className="mt-1 block text-xs text-stone-500">
              {[item.originalTitle, item.releaseYear].filter(Boolean).join(" • ") || item.code}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
