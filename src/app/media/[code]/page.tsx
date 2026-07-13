import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MediaItemDetails } from "@/app/media-item-details";
import { MediaItemRatingDialog } from "@/app/media-item-rating-dialog";
import { MediaItemReviews } from "@/app/media-item-reviews";
import { getPublishedReviewsForMediaItem } from "@/db/queries/contribution-reviews";
import {
  getMediaItemByCode,
  getOtherMediaItemsFromFranchises,
  getPublicMediaItemMetadataByCode,
} from "@/db/queries/media-items";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getMediaCarrierFrame } from "@/lib/media/carrier-frame";
import { formatMediaItemSummary } from "@/lib/media/media-item-summary";
import { getMediaTypeLabel } from "@/lib/media/types";

type MediaItemPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export async function generateMetadata({ params }: MediaItemPageProps): Promise<Metadata> {
  const { code } = await params;
  const item = await getPublicMediaItemMetadataByCode(code);

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
  const currentAuthor = await getCurrentAuthor();
  const item = await getMediaItemByCode(code, currentAuthor?.id);

  if (!item) {
    notFound();
  }

  const mediaCarrierFrame = getMediaCarrierFrame(item);
  const firstFranchiseCode = item.franchises[0]?.code ?? null;
  const [relatedFranchiseSections, reviews, mediaTypes] = await Promise.all([
    Promise.all(
      item.franchises.map(async (franchise) => ({
        franchise,
        items: await getOtherMediaItemsFromFranchises([franchise.id], item.id, currentAuthor?.id),
      })),
    ),
    getPublishedReviewsForMediaItem(item.id),
    getMediaTypeOptions(),
  ]);
  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto w-full max-w-6xl">
        <MediaItemDetails
          item={item}
          variant="archive"
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
                    href={`/?type=${encodeURIComponent(item.mediaType)}`}
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
          adjacentShelfSlot={
            <MediaItemReviews
              mediaItemId={item.id}
              currentAuthor={
                currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
              }
              reviews={reviews}
            />
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
      </div>
    </main>
  );
}
