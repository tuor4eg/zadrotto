import { notFound } from "next/navigation";

import { AuthorRatingForm } from "@/app/author-rating-form";
import { MediaItemDetails } from "@/app/media-item-details";
import { getMediaItemByCode, getOtherMediaItemsFromFranchise } from "@/db/queries/media-items";
import { getCurrentAuthor } from "@/lib/author-auth";

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

  const relatedItems = item.franchiseId
    ? await getOtherMediaItemsFromFranchise(item.franchiseId, item.id)
    : [];

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <MediaItemDetails
          item={item}
          backLink={{ href: "/", label: "Назад к картотеке" }}
          relatedItems={relatedItems}
          ratingSlot={
            <AuthorRatingForm
              mediaItemCode={item.code}
              franchiseCode={item.franchiseCode}
              currentAuthor={
                currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
              }
              currentAuthorScore={item.currentAuthorScore}
            />
          }
        />
      </div>
    </main>
  );
}
