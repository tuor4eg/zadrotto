import { notFound } from "next/navigation";

import { MediaItemDetails } from "@/app/media-item-details";
import { MediaItemRatingDialog } from "@/app/media-item-rating-dialog";
import { MediaItemReviews } from "@/app/media-item-reviews";
import { getPublishedReviewsForMediaItem } from "@/db/queries/contribution-reviews";
import { getMediaItemByCode, getOtherMediaItemsFromFranchise } from "@/db/queries/media-items";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getMediaCarrierFrame } from "@/lib/media/carrier-frame";

type MediaItemPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function MediaItemPage({ params }: MediaItemPageProps) {
  const { code } = await params;
  const currentAuthor = await getCurrentAuthor();
  const item = await getMediaItemByCode(code, currentAuthor?.id);

  if (!item) {
    notFound();
  }

  const mediaCarrierFrame = getMediaCarrierFrame(item);
  const [relatedItems, reviews, mediaTypes] = await Promise.all([
    item.franchiseId
      ? getOtherMediaItemsFromFranchise(item.franchiseId, item.id, currentAuthor?.id)
      : [],
    getPublishedReviewsForMediaItem(item.id),
    getMediaTypeOptions(),
  ]);

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto w-full max-w-6xl">
        <MediaItemDetails
          item={item}
          variant="archive"
          backLink={{ href: "/", label: "Назад к картотеке" }}
          mediaTypes={mediaTypes}
          relatedItems={relatedItems}
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
              franchiseCode={item.franchiseCode}
              title={item.title}
              currentAuthor={
                currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
              }
              currentAuthorFirstExperiencedAt={item.currentAuthorFirstExperiencedAt}
              currentAuthorFirstExperiencedPrecision={item.currentAuthorFirstExperiencedPrecision}
              currentAuthorScore={item.currentAuthorScore}
              panelDisplayClassName={mediaCarrierFrame?.displayFontClassName}
              panelLabelClassName={mediaCarrierFrame?.labelFontClassName}
              panelVariant={mediaCarrierFrame?.ratingPanelVariant}
            />
          }
        />
      </div>
    </main>
  );
}
