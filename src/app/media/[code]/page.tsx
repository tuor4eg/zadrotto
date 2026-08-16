import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MediaItemDetails } from "@/app/media-item-details";
import { MediaItemRatingDialog } from "@/app/media-item-rating-dialog";
import { AuthorMediaStatusControls } from "@/app/author-media-status-controls";
import { MediaItemFranchiseSuggestionDialog } from "@/app/media-item-franchise-suggestion-dialog";
import { MediaItemReviewLayer, MediaItemReviews } from "@/app/media-item-reviews";
import { RecentlyViewedMarker } from "@/app/media/recently-viewed-marker";
import { AdminEntityEditLink } from "@/components/archive/admin-entity-edit-link";
import { getPublishedReviewsForMediaItem } from "@/db/queries/contribution-reviews";
import {
  getMediaItemByCode,
  getPublicMediaItemMetadataByCode,
  getRelatedFranchiseSections,
} from "@/db/queries/media-items";
import {
  getAccessibleMediaTypeCodes,
  getAllMediaTypeOptions,
  getEnabledMediaTypeCodes,
} from "@/db/queries/media-types";
import { getPublishedFranchiseOptions } from "@/db/queries/franchises";
import { isAiScenarioEnabled } from "@/db/queries/ai-scenarios";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getMediaCarrierFrame } from "@/lib/media/carrier-frame";
import { mapFranchiseSuggestionOptions } from "@/lib/media/franchise-suggestion-options";
import { formatMediaItemSummary } from "@/lib/media/media-item-summary";
import { getMediaTypeLabel } from "@/lib/media/types";
import { AI_SCENARIO_KEYS } from "@/lib/ai/scenarios/catalog";
import { isQuizMediaTypeAllowed } from "@/lib/quizzes/model";
import { getActiveQuiz } from "@/db/queries/quizzes";
import { QuizGuessButton } from "@/components/quizzes/quiz-guess-button";

export const dynamic = "force-dynamic";

type MediaItemPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export async function generateMetadata({ params }: MediaItemPageProps): Promise<Metadata> {
  const { code } = await params;
  const currentAuthor = await getCurrentAuthor();
  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(currentAuthor?.id);
  const item = await getPublicMediaItemMetadataByCode(code, accessibleMediaTypeCodes);

  if (!item) {
    return {};
  }

  const description = formatMediaItemSummary(item);
  const images = item.coverUrl ? [item.coverUrl] : undefined;

  return {
    title: item.title,
    description,
    openGraph: {
      type: "website",
      title: item.title,
      description,
      images,
    },
    twitter: {
      card: item.coverUrl ? "summary_large_image" : "summary",
      title: item.title,
      description,
      images,
    },
  };
}

export default async function MediaItemPage({ params }: MediaItemPageProps) {
  const { code } = await params;
  const [currentAuthor, currentAdminUser] = await Promise.all([
    getCurrentAuthor(),
    getCurrentAdminUser(),
  ]);
  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(currentAuthor?.id);
  const item = await getMediaItemByCode(code, accessibleMediaTypeCodes, currentAuthor?.id);

  if (!item) {
    notFound();
  }

  const mediaCarrierFrame = getMediaCarrierFrame(item);
  const publishedFranchiseLinks = item.franchises.filter(
    (franchise) => franchise.publicationStatus === "published",
  );
  const enabledMediaTypeCodes = await getEnabledMediaTypeCodes(currentAuthor?.id);
  const firstFranchiseCode = publishedFranchiseLinks[0]?.code ?? null;
  const [relatedFranchiseSections, reviews, mediaTypes, publishedFranchises, canSuggestFranchises, activeQuiz] = await Promise.all([
    getRelatedFranchiseSections({
      franchises: publishedFranchiseLinks,
      currentMediaItemId: item.id,
      enabledMediaTypeCodes,
      currentAuthorId: currentAuthor?.id,
    }),
    getPublishedReviewsForMediaItem(item.id),
    getAllMediaTypeOptions(),
    currentAuthor ? getPublishedFranchiseOptions() : Promise.resolve([]),
    currentAuthor
      ? isAiScenarioEnabled(AI_SCENARIO_KEYS.SUGGEST_SERIES)
      : Promise.resolve(false),
    currentAuthor ? getActiveQuiz() : Promise.resolve(null),
  ]);
  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      {currentAuthor ? <RecentlyViewedMarker code={item.code} /> : null}
      <div className="mx-auto w-full max-w-6xl">
        <MediaItemDetails
          item={item}
          variant="archive"
          headerActions={
            currentAdminUser ? (
              <AdminEntityEditLink
                ariaLabel={`Редактировать запись ${item.title}`}
                href={`/admin/media/${item.id}/edit`}
                tooltipLabel="Редактировать запись"
              />
            ) : null
          }
          breadcrumbSlot={
            <nav
              aria-label="Хлебные крошки"
              className="min-w-0 flex-1 text-xs leading-5 text-stone-600"
            >
              <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <Link
                    className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
                    href="/"
                  >
                    Главная
                  </Link>
                </li>
                <li aria-hidden="true" className="text-stone-400">
                  /
                </li>
                <li>
                  <Link
                    className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
                    href="/archive"
                  >
                    Архив
                  </Link>
                </li>
                <li aria-hidden="true" className="text-stone-400">
                  /
                </li>
                <li>
                  <Link
                    className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
                    href={`/archive?type=${encodeURIComponent(item.mediaType)}`}
                  >
                    {getMediaTypeLabel(item.mediaType, mediaTypes)}
                  </Link>
                </li>
                <li aria-hidden="true" className="text-stone-400">
                  /
                </li>
                <li
                  className="min-w-0 max-w-full flex-1 truncate text-stone-800"
                  aria-current="page"
                >
                  {item.title}
                </li>
              </ol>
            </nav>
          }
          mediaTypes={mediaTypes}
          relatedFranchiseSections={relatedFranchiseSections}
          showFranchiseSection={Boolean(currentAuthor)}
          franchiseActions={
            currentAuthor ? (
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
                franchiseSuggestionInput={{
                  title: item.title,
                  originalTitle: item.originalTitle,
                  aliases: item.aliases,
                  description: item.description,
                  mediaType: item.mediaType,
                  mediaTypeLabel: getMediaTypeLabel(item.mediaType, mediaTypes),
                  releaseYear: item.releaseYear,
                  mediaCarrier: item.mediaCarrierName,
                  metadata: item.metadataFacts ?? {},
                }}
              />
            ) : null
          }
          adjacentShelfSlot={
            currentAuthor || reviews.length > 0 ? (
              <MediaItemReviews
                mediaItemId={item.id}
                currentAuthor={
                  currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
                }
                reviews={reviews}
              />
            ) : null
          }
          titleActions={
            currentAuthor && item.currentAuthorScore === null ? (
              <div className="flex flex-wrap gap-2">
                <AuthorMediaStatusControls
                  className="mt-0"
                  currentAuthorScore={item.currentAuthorScore}
                  currentAuthorStatus={item.currentAuthorStatus}
                  mediaItemCode={item.code}
                />
                {activeQuiz && isQuizMediaTypeAllowed(activeQuiz.mediaTypes, item.mediaType) ? (
                  <QuizGuessButton titleId={item.id} variant="icon" />
                ) : null}
              </div>
            ) : currentAuthor && activeQuiz && isQuizMediaTypeAllowed(activeQuiz.mediaTypes, item.mediaType) ? (
              <QuizGuessButton titleId={item.id} variant="icon" />
            ) : null
          }
          ratingSlot={
            <MediaItemRatingDialog
              mediaItemCode={item.code}
              franchiseCode={firstFranchiseCode}
              title={item.title}
              currentAuthor={
                currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
              }
              currentAuthorFirstExperiencedAt={item.currentAuthorFirstExperiencedAt}
              currentAuthorFirstExperiencedPrecision={item.currentAuthorFirstExperiencedPrecision}
              currentAuthorScore={item.currentAuthorScore}
              releaseYear={item.releaseYear}
              panelDisplayClassName={mediaCarrierFrame?.displayFontClassName}
              panelLabelClassName={mediaCarrierFrame?.labelFontClassName}
              panelVariant={mediaCarrierFrame?.ratingPanelVariant}
            />
          }
          compactRatingSlot={
            <MediaItemRatingDialog
              mediaItemCode={item.code}
              franchiseCode={firstFranchiseCode}
              title={item.title}
              currentAuthor={
                currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
              }
              currentAuthorFirstExperiencedAt={item.currentAuthorFirstExperiencedAt}
              currentAuthorFirstExperiencedPrecision={item.currentAuthorFirstExperiencedPrecision}
              currentAuthorScore={item.currentAuthorScore}
              releaseYear={item.releaseYear}
              panelDisplayClassName={mediaCarrierFrame?.displayFontClassName}
              panelLabelClassName={mediaCarrierFrame?.labelFontClassName}
              panelVariant={mediaCarrierFrame?.ratingPanelVariant}
              size="compact"
            />
          }
        />
        <MediaItemReviewLayer
          currentAuthor={
            currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
          }
          mediaItemTitle={item.title}
          reviews={reviews}
        />
      </div>
    </main>
  );
}
