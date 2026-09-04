import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReviewArticle } from "@/app/review-article";
import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { BugReportEntityContextRegistration } from "@/components/bug-reports/bug-report-entity-context";
import {
  getPublishedReviewById,
  getPublishedReviewNavigation,
} from "@/db/queries/contribution-reviews";
import { getAccessibleMediaTypeCodes, getAllMediaTypeOptions } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { getMediaItemSummaryParts } from "@/lib/media/media-item-summary";
import { getMediaTypeLabel } from "@/lib/media/types";

export const dynamic = "force-dynamic";

type ReviewPageProps = { params: Promise<{ id: string }> };

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getReview(idValue: string, currentAuthor: Awaited<ReturnType<typeof getCurrentAuthor>>) {
  const id = parseId(idValue);
  if (!id) return { currentAuthor: null, review: null };
  const [accessibleMediaTypeCodes, mediaTypes] = await Promise.all([
    getAccessibleMediaTypeCodes(currentAuthor?.id),
    getAllMediaTypeOptions(),
  ]);
  const review = await getPublishedReviewById(id, accessibleMediaTypeCodes);
  return { currentAuthor, mediaTypes, review };
}

export async function generateMetadata({ params }: ReviewPageProps): Promise<Metadata> {
  const currentAuthor = await getCurrentAuthor();
  const { review } = await getReview((await params).id, currentAuthor);
  if (!review) return {};
  return {
    title: `${review.title} — рецензия на «${review.mediaItemTitle}»`,
    description: review.body.replace(/\s+/g, " ").trim().slice(0, 180),
  };
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const headerState = await getPublicSiteHeaderState();
  const { currentAuthor, mediaTypes, review } = await getReview((await params).id, headerState.author);
  if (!review) notFound();
  const reviewNavigation = await getPublishedReviewNavigation(review.mediaItemId, review.id);

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <BugReportEntityContextRegistration context={{ entityId: String(review.mediaItemId), entityType: "media-item" }} />
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <div className="mx-auto w-full max-w-6xl">
        <ReviewArticle
          canEdit={currentAuthor?.code === review.authorCode}
          mediaItemTypeLabel={getMediaTypeLabel(review.mediaItemMediaType, mediaTypes)}
          mediaItemMeta={getMediaItemSummaryParts({
            mediaType: review.mediaItemMediaType,
            mediaTypeLabel: getMediaTypeLabel(review.mediaItemMediaType, mediaTypes),
            metadataFacts: review.mediaItemMetadataFacts,
            releaseYear: review.mediaItemReleaseYear,
          })}
          nextReviewId={reviewNavigation.nextReviewId}
          previousReviewId={reviewNavigation.previousReviewId}
          review={review}
        />
        </div>
      </div>
    </main>
  );
}
