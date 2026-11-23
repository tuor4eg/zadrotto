import { EntrySources } from "@/components/archive/entry-source-links";
import { getEntrySources, getWorksBasedOn } from "@/db/queries/entry-sources";
import { canManageFranchises } from "@/lib/franchises/access";
import { getVisibleMediaItemTags } from "@/db/queries/tags";
import { MediaItemTags } from "@/components/archive/media-item-tags";
import { buildPublicPageMetadata, NO_INDEX_METADATA } from "@/lib/seo/metadata";
import { getComicArtistWork } from "@/db/queries/comic-artist-work";
import { getAnimeCreatorDisplay } from "@/db/queries/anilist-creator-display";
import { getSeriesCreatorDisplay } from "@/db/queries/tmdb-series-display";
import { resolveMediaItemDisplayTitles } from "@/lib/media/display-titles";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { TitlePartsSection } from "@/components/archive/title-parts-section";
import { getGameCompanyDisplay } from "@/db/queries/game-companies";
import { getFilmDirectorDisplay } from "@/db/queries/tmdb-director-display";
import { getFilmCompanyDisplay } from "@/db/queries/tmdb-company-display";
import { getTitlePartsForMediaItem } from "@/db/queries/title-parts";
import { MediaItemDetails } from "@/app/media-item-details";
import { MediaItemRatingDialog } from "@/app/media-item-rating-dialog";
import { AuthorMediaStatusControls } from "@/app/author-media-status-controls";
import { MediaItemFranchiseSuggestionDialog } from "@/app/media-item-franchise-suggestion-dialog";
import { MediaItemReviews } from "@/app/media-item-reviews";
import { RecentlyViewedMarker } from "@/app/media/recently-viewed-marker";
import { AdminEntityEditLink } from "@/components/archive/admin-entity-edit-link";
import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { getPublishedReviewsForMediaItem } from "@/db/queries/contribution-reviews";
import {
  getMediaItemByCode,
  getPublicMediaItemMetadataByCode,
  getRelatedFranchiseSections,
  getRelatedTagSections,
  getSourceMediaCards,
} from "@/db/queries/media-items";
import {
  getAccessibleMediaTypeCodes,
  getAllMediaTypeOptions,
  getEnabledMediaTypeCodes,
} from "@/db/queries/media-types";
import { getPublishedFranchiseOptions } from "@/db/queries/franchises";
import { isAiScenarioEnabled } from "@/db/queries/ai-scenarios";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getMediaCarrierFrame } from "@/lib/media/carrier-frame";
import { mapFranchiseSuggestionOptions } from "@/lib/media/franchise-suggestion-options";
import { formatMediaItemSummary } from "@/lib/media/media-item-summary";
import { resolvePublicMediaDescription } from "@/lib/media/editorial-summary";
import { getMediaTypeLabel } from "@/lib/media/types";
import { AI_SCENARIO_KEYS } from "@/lib/ai/scenarios/catalog";
import { isQuizMediaTypeAllowed } from "@/lib/quizzes/model";
import { getParticipatingActiveQuiz } from "@/db/queries/quizzes";
import { QuizGuessButton } from "@/components/quizzes/quiz-guess-button";
import { BugReportEntityContextRegistration } from "@/components/bug-reports/bug-report-entity-context";

export const dynamic = "force-dynamic";

type MediaItemPageProps = {
  params: Promise<{
    code: string;
  }>;
  searchParams: Promise<{ review?: string }>;
};

export async function generateMetadata({ params }: MediaItemPageProps): Promise<Metadata> {
  const { code } = await params;
  const currentAuthor = await getCurrentAuthor();
  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(currentAuthor?.id);
  const item = await getPublicMediaItemMetadataByCode(code, accessibleMediaTypeCodes);

  if (!item) {
    return NO_INDEX_METADATA;
  }

  const { displayTitle } = resolveMediaItemDisplayTitles(item);
  const description = resolvePublicMediaDescription(item) ?? formatMediaItemSummary(item);
  return buildPublicPageMetadata(
    `/media/${encodeURIComponent(code)}`,
    displayTitle,
    description,
    item.coverUrl,
  );
}

export default async function MediaItemPage({ params, searchParams }: MediaItemPageProps) {
  const { code } = await params;
  const legacyReviewId = (await searchParams).review;
  if (legacyReviewId && /^\d+$/.test(legacyReviewId)) {
    redirect(`/reviews/${legacyReviewId}`);
  }
  const headerState = await getPublicSiteHeaderState();
  const currentAuthor = headerState.author;
  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(currentAuthor?.id);
  const item = await getMediaItemByCode(code, accessibleMediaTypeCodes, currentAuthor?.id);

  if (!item) {
    notFound();
  }

  const mayManageFranchises = canManageFranchises(currentAuthor);
  const visibleTags = await getVisibleMediaItemTags(item.id, currentAuthor?.id);
  const { displayTitle } = resolveMediaItemDisplayTitles(item);
  const mediaCarrierFrame = getMediaCarrierFrame(item);
  const publicDescription = resolvePublicMediaDescription(item);
  const publishedFranchiseLinks = item.franchises.filter(
    (franchise) => franchise.publicationStatus === "published",
  );
  const enabledMediaTypeCodes = await getEnabledMediaTypeCodes(currentAuthor?.id);
  const firstFranchiseCode = publishedFranchiseLinks[0]?.code ?? null;
  const [relatedTagSections, relatedFranchiseSections, reviews, mediaTypes, publishedFranchises, canSuggestFranchises, activeQuiz, parts, gameCompanies, filmCompanies, filmDirectors, seriesCreators, animeCreators, comicArtistWork, [entrySources, adaptations, sourceCards]] = await Promise.all([
    getRelatedTagSections({ tags: visibleTags, currentMediaItemId: item.id, enabledMediaTypeCodes, currentAuthorId: currentAuthor?.id }),
    getRelatedFranchiseSections({
      franchises: publishedFranchiseLinks,
      currentMediaItemId: item.id,
      enabledMediaTypeCodes,
      currentAuthorId: currentAuthor?.id,
    }),
    getPublishedReviewsForMediaItem(item.id),
    getAllMediaTypeOptions(),
    mayManageFranchises ? getPublishedFranchiseOptions() : Promise.resolve([]),
    mayManageFranchises
      ? isAiScenarioEnabled(AI_SCENARIO_KEYS.SUGGEST_SERIES)
      : Promise.resolve(false),
    currentAuthor ? getParticipatingActiveQuiz(currentAuthor.id) : Promise.resolve(null),
    getTitlePartsForMediaItem(item.id, currentAuthor?.id),
    item.mediaType === "game" ? getGameCompanyDisplay(item.id) : Promise.resolve(undefined),
    item.mediaType === "film" ? getFilmCompanyDisplay(item.id) : Promise.resolve(undefined),
    item.mediaType === "film" ? getFilmDirectorDisplay(item.id) : Promise.resolve(undefined),
    item.mediaType === "series" ? getSeriesCreatorDisplay(item.id) : Promise.resolve(undefined),
    item.mediaType === "anime" ? getAnimeCreatorDisplay(item.id) : Promise.resolve(undefined),
    item.mediaType === "comic" ? getComicArtistWork(item.id) : Promise.resolve(undefined),
    Promise.all([
      getEntrySources(item.id, accessibleMediaTypeCodes),
      getWorksBasedOn("entry", item.id, accessibleMediaTypeCodes),
    ]).then(async ([sources, works]) => {
      const ids = new Set([
        ...sources.filter((source) => source.type === "entry").map((source) => source.id),
        ...works.map((work) => work.id),
      ]);
      const cards = await getSourceMediaCards([...ids], accessibleMediaTypeCodes, currentAuthor?.id);
      const adaptations = works.map((work) => ({ ...work, type: "entry" as const }));
      return [sources, adaptations, cards] as const;
    }),
  ]);
  const visibleParts = parts.filter((part) => part.type !== "season" || part.number !== 0);
  const partsUnderPoster = visibleParts.length > 0 && visibleParts.length <= 3 &&
    visibleParts.every((part) => part.type === "season");
  const partsSection = visibleParts.length > 0 ? (
    <TitlePartsSection
      parts={parts}
      mediaItemCode={item.code}
      mediaType={item.mediaType}
      title={displayTitle}
      currentAuthor={currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null}
    />
  ) : null;

  return (
    <main className="archive-page flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <BugReportEntityContextRegistration context={{ entityId: String(item.id), entityType: "media-item" }} />
      {currentAuthor ? <RecentlyViewedMarker code={item.code} /> : null}
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <div className="flex min-h-0 w-full flex-1 flex-col">
        <MediaItemDetails
          entrySourcesSlot={entrySources.length || adaptations.length ? (
            <div className="grid min-w-0 gap-5">
              <EntrySources
                sources={entrySources}
                cards={sourceCards}
                mediaTypes={mediaTypes}
                isAuthorized={Boolean(currentAuthor)}
              />
              <EntrySources
                heading="Адаптации"
                sources={adaptations}
                cards={sourceCards}
                mediaTypes={mediaTypes}
                isAuthorized={Boolean(currentAuthor)}
              />
            </div>
          ) : null}
          tagsSlot={<MediaItemTags tags={visibleTags} mediaItemCode={item.code} canAssign={Boolean(currentAuthor)} />}
          item={{ ...item, description: publicDescription, gameCompanies, filmCompanies, filmDirectors, seriesCreators, animeCreators, comicArtistWork }}
          variant="archive"
          headerActions={
            headerState.currentAdminUser ? (
              <AdminEntityEditLink
                ariaLabel={`Редактировать запись ${displayTitle}`}
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
                  {displayTitle}
                </li>
              </ol>
            </nav>
          }
          mediaTypes={mediaTypes}
          relatedFranchiseSections={relatedFranchiseSections}
          relatedTagSections={relatedTagSections}
          showFranchiseSection={mayManageFranchises}
          franchiseActions={
            currentAuthor && mayManageFranchises ? (
              <MediaItemFranchiseSuggestionDialog
                assignedFranchises={item.franchises}
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
          partsSlot={partsUnderPoster ? null : partsSection}
          posterPartsSlot={partsUnderPoster ? partsSection : null}
          reviewsSlot={
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
          cornerActions={currentAuthor ? (
            <div className="flex items-center gap-2">
              {item.currentAuthorScore === null ? (
                <AuthorMediaStatusControls
                  className="mt-0"
                  currentAuthorScore={item.currentAuthorScore}
                  currentAuthorHasRating={item.currentAuthorRatedAt !== null}
                  isAuthorized
                  currentAuthorStatus={item.currentAuthorStatus}
                  mediaItemCode={item.code}
                />
              ) : null}
              {activeQuiz && isQuizMediaTypeAllowed(activeQuiz.mediaTypes, item.mediaType) ? (
                <QuizGuessButton titleId={item.id} />
              ) : null}
            </div>
          ) : null}
          ratingSlot={
            <MediaItemRatingDialog
              mediaItemCode={item.code}
              franchiseCode={firstFranchiseCode}
              title={displayTitle}
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
              title={displayTitle}
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
        </div>
      </div>
    </main>
  );
}
