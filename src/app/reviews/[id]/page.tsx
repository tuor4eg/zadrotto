import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReviewArticle } from "@/app/review-article";
import { MediaItemFranchiseSuggestionDialog } from "@/app/media-item-franchise-suggestion-dialog";
import { ArchiveMediaItemIdentity } from "@/components/archive/archive-media-item-identity";
import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { BugReportEntityContextRegistration } from "@/components/bug-reports/bug-report-entity-context";
import {
  getPublishedReviewById,
  getOtherPublishedReviewCardsByAuthor,
  getOtherPublishedReviewCardsForMediaItem,
} from "@/db/queries/contribution-reviews";
import { getPublishedFranchiseOptions } from "@/db/queries/franchises";
import { getMediaItemByCode } from "@/db/queries/media-items";
import {
  getAccessibleMediaTypeCodes,
  getAllMediaTypeOptions,
  getEnabledMediaTypeCodes,
} from "@/db/queries/media-types";
import { isAiScenarioEnabled } from "@/db/queries/ai-scenarios";
import { AI_SCENARIO_KEYS } from "@/lib/ai/scenarios/catalog";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { inlineMarkupToPlainText, parseInlineMarkup } from "@/lib/inline-mentions/markup";
import { resolveInlineEntities } from "@/lib/inline-mentions/server";
import { mapFranchiseSuggestionOptions } from "@/lib/media/franchise-suggestion-options";

export const dynamic = "force-dynamic";

type ReviewPageProps = { params: Promise<{ id: string }> };

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getReview(idValue: string, currentAuthor: Awaited<ReturnType<typeof getCurrentAuthor>>) {
  const id = parseId(idValue);
  if (!id) return { accessibleMediaTypeCodes: [], currentAuthor: null, review: null };
  const [accessibleMediaTypeCodes, mediaTypes] = await Promise.all([
    getAccessibleMediaTypeCodes(currentAuthor?.id),
    getAllMediaTypeOptions(),
  ]);
  const review = await getPublishedReviewById(id, accessibleMediaTypeCodes);
  return { accessibleMediaTypeCodes, currentAuthor, mediaTypes, review };
}

export async function generateMetadata({ params }: ReviewPageProps): Promise<Metadata> {
  const currentAuthor = await getCurrentAuthor();
  const { review } = await getReview((await params).id, currentAuthor);
  if (!review) return {};
  return {
    title: `${review.title} — рецензия на «${review.mediaItemTitle}»`,
    description: inlineMarkupToPlainText(review.body).replace(/\s+/g, " ").trim().slice(0, 180),
  };
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const headerState = await getPublicSiteHeaderState();
  const { accessibleMediaTypeCodes, currentAuthor, mediaTypes, review } = await getReview((await params).id, headerState.author);
  if (!review) notFound();
  const [item, enabledMediaTypeCodes] = await Promise.all([
    getMediaItemByCode(review.mediaItemCode, accessibleMediaTypeCodes, currentAuthor?.id),
    getEnabledMediaTypeCodes(currentAuthor?.id),
  ]);
  if (!item) notFound();
  const inlineNodes = parseInlineMarkup(review.body);
  const [
    resolvedInlineEntities,
    otherMediaItemReviews,
    otherAuthorReviews,
    publishedFranchises,
    canSuggestFranchises,
  ] = await Promise.all([
    resolveInlineEntities(inlineNodes, { accessibleMediaTypeCodes }),
    getOtherPublishedReviewCardsForMediaItem({
      excludeReviewId: review.id,
      limit: 5,
      mediaItemId: review.mediaItemId,
    }),
    getOtherPublishedReviewCardsByAuthor({
      accessibleMediaTypeCodes: enabledMediaTypeCodes,
      authorId: review.authorId,
      excludeReviewId: review.id,
      limit: 5,
    }),
    currentAuthor ? getPublishedFranchiseOptions() : Promise.resolve([]),
    currentAuthor
      ? isAiScenarioEnabled(AI_SCENARIO_KEYS.SUGGEST_SERIES)
      : Promise.resolve(false),
  ]);

  const franchiseActions = currentAuthor ? (
    <MediaItemFranchiseSuggestionDialog
      assignedFranchises={item.franchises}
      canPublishWithoutReview={currentAuthor.canPublishFranchisesWithoutReview}
      canSuggestFranchises={canSuggestFranchises}
      franchises={mapFranchiseSuggestionOptions(
        publishedFranchises,
        item.franchiseLinkStatuses,
      )}
      mediaItemCode={item.code}
      mediaItemId={item.id}
      triggerTooltipPortal
      franchiseSuggestionInput={{
        title: item.title,
        originalTitle: item.originalTitle,
        aliases: item.aliases,
        description: item.description,
        mediaType: item.mediaType,
        mediaTypeLabel: mediaTypes.find(({ code }) => code === item.mediaType)?.name ?? item.mediaType,
        releaseYear: item.releaseYear,
        mediaCarrier: item.mediaCarrierName,
        metadata: item.metadataFacts ?? {},
      }}
    />
  ) : null;

  return (
    <main className="archive-page flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <BugReportEntityContextRegistration context={{ entityId: String(review.mediaItemId), entityType: "media-item" }} />
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <div className="flex min-h-0 w-full flex-1 flex-col">
        <ReviewArticle
          canEdit={currentAuthor?.code === review.authorCode}
          inlineNodes={inlineNodes}
          mediaItemIdentity={
            <ArchiveMediaItemIdentity
              franchiseActions={franchiseActions}
              item={item}
              mediaTypes={mediaTypes}
              showFranchiseSection={Boolean(currentAuthor)}
            />
          }
          otherAuthorReviews={otherAuthorReviews}
          otherMediaItemReviews={otherMediaItemReviews}
          resolvedInlineEntities={resolvedInlineEntities}
          review={review}
        />
        </div>
      </div>
    </main>
  );
}
