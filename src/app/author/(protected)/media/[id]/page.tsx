import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MediaItemDetails } from "@/app/media-item-details";
import { MediaItemRatingDialog } from "@/app/media-item-rating-dialog";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { getAuthorMediaItemForView } from "@/db/queries/media-items";
import { isAuthorEditablePublicationStatus } from "@/lib/author-media-form";
import {
  canAuthorDeleteMediaItem,
  canAuthorRequestPublication,
  canAuthorWithdrawPublicationRequest,
} from "@/lib/author-media-publication";
import { requireAuthor } from "@/lib/author-auth";
import {
  PUBLICATION_STATUS_VALUE_LABELS,
  PUBLISHED_PUBLICATION_STATUS,
} from "@/lib/publication-status";
import {
  deleteAuthorMediaItemAction,
  publishAuthorMediaItemAction,
  withdrawAuthorMediaItemAction,
} from "../actions";

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
  const canWithdrawPublication = canAuthorWithdrawPublicationRequest(item.publicationStatus);
  const canDelete = canAuthorDeleteMediaItem(item.publicationStatus);

  return (
    <MediaItemDetails
      item={item}
      variant="archive"
      backLink={{ href: "/author/media", label: "Назад к предложениям" }}
      meta={<span>{PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus]}</span>}
      actions={
        <>
          {isEditable ? (
            <Link
              href={`/author/media/${item.id}/edit`}
              className={buttonVariants({ size: "sm", className: "w-fit" })}
            >
              Править
            </Link>
          ) : null}
          {canRequestPublication ? (
            <ConfirmAction
              action={publishAuthorMediaItemAction}
              className="w-fit"
              confirmLabel="Отправить"
              confirmVariant="positive"
              description={`Если администратор одобрит «${item.title}», запись попадет в общую базу и пропадет из черновиков. После этого ты уже не сможешь ее редактировать или удалить из предложений.`}
              fields={[{ name: "mediaItemId", value: item.id }]}
              title="Отправить на публикацию?"
              triggerLabel="Опубликовать"
              triggerAriaLabel={`Отправить на публикацию ${item.title}`}
              triggerVariant="positive"
            />
          ) : null}
          {canWithdrawPublication ? (
            <form action={withdrawAuthorMediaItemAction}>
              <input type="hidden" name="mediaItemId" value={item.id} />
              <Button type="submit" variant="outline" size="sm" className="w-fit">
                Отозвать с проверки
              </Button>
            </form>
          ) : null}
          {canDelete ? (
            <ConfirmAction
              action={deleteAuthorMediaItemAction}
              className="w-fit"
              fields={[{ name: "mediaItemId", value: item.id }]}
              title="Удалить черновик?"
              description={`Запись «${item.title}» будет удалена из твоих предложений. Это действие нельзя отменить.`}
              triggerLabel="Удалить"
              triggerAriaLabel={`Удалить черновик ${item.title}`}
              confirmLabel="Удалить"
            />
          ) : null}
        </>
      }
      ratingSlot={
        <MediaItemRatingDialog
          mediaItemCode={item.code}
          franchiseCode={item.franchiseCode}
          title={item.title}
          currentAuthor={{ name: author.name, code: author.code }}
          currentAuthorFirstExperiencedAt={item.currentAuthorFirstExperiencedAt}
          currentAuthorFirstExperiencedPrecision={item.currentAuthorFirstExperiencedPrecision}
          currentAuthorScore={item.currentAuthorScore}
        />
      }
      noteSlot={
        item.adminNote ? (
          <Alert>
            {item.adminNote}
          </Alert>
        ) : null
      }
    />
  );
}
