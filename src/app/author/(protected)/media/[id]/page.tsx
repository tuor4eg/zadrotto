import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthorRatingForm } from "@/app/author-rating-form";
import { MediaItemDetails } from "@/app/media-item-details";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { getAuthorMediaItemForView } from "@/db/queries/media-items";
import { isAuthorEditablePublicationStatus } from "@/lib/author-media-form";
import { canAuthorRequestPublication } from "@/lib/author-media-publication";
import { requireAuthor } from "@/lib/author-auth";
import {
  PUBLICATION_STATUS_VALUE_LABELS,
  PUBLISHED_PUBLICATION_STATUS,
} from "@/lib/publication-status";
import { publishAuthorMediaItemAction } from "../actions";

type AuthorMediaViewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AuthorMediaViewPage({ params }: AuthorMediaViewPageProps) {
  const [{ id }, author] = await Promise.all([params, requireAuthor()]);
  const mediaItemId = Number(id);

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const item = await getAuthorMediaItemForView(author.id, mediaItemId);

  if (!item) {
    notFound();
  }

  if (item.publicationStatus === PUBLISHED_PUBLICATION_STATUS) {
    redirect(`/media/${item.code}`);
  }

  const isEditable = isAuthorEditablePublicationStatus(item.publicationStatus);
  const canRequestPublication = canAuthorRequestPublication(item.publicationStatus);

  return (
    <MediaItemDetails
      item={item}
      backLink={{ href: "/author/media", label: "Назад к картотеке" }}
      meta={<span>{PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus]}</span>}
      actions={
        <>
          {isEditable ? (
            <Link
              href={`/author/media/${item.id}/edit`}
              className={buttonVariants({ className: "w-fit" })}
            >
              Править
            </Link>
          ) : null}
          {canRequestPublication ? (
            <form action={publishAuthorMediaItemAction}>
              <input type="hidden" name="mediaItemId" value={item.id} />
              <Button type="submit" variant="positive" className="w-fit">
                Опубликовать
              </Button>
            </form>
          ) : null}
        </>
      }
      noteSlot={
        <>
          <AuthorRatingForm
            mediaItemCode={item.code}
            franchiseCode={item.franchiseCode}
            currentAuthor={{ name: author.name, code: author.code }}
            currentAuthorScore={item.currentAuthorScore}
          />
          {item.adminNote ? (
            <Alert>
              {item.adminNote}
            </Alert>
          ) : null}
        </>
      }
    />
  );
}
