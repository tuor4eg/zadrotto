import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { getFranchiseOptions } from "@/db/queries/franchises";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getMediaItemMetadata } from "@/db/queries/media-item-metadata";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getAuthorMediaItemForEdit } from "@/db/queries/media-items";
import { canAuthorCreateFranchise } from "@/lib/authors/media-publication";
import { isAuthorEditablePublicationStatus } from "@/lib/forms/author-media";
import { requireAuthor } from "@/lib/auth/author-auth";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/media/publication-status";
import { AuthorToasts } from "../../../author-toasts";
import { updateAuthorMediaItemAction } from "../../actions";
import { MediaItemForm } from "../../media-item-form";
import { getAuthorMediaFormErrorMessage } from "../../messages";

type EditAuthorMediaPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function EditAuthorMediaPage({
  params,
  searchParams,
}: EditAuthorMediaPageProps) {
  const [{ id }, { error }, author, franchises, mediaCarriers, mediaTypes] = await Promise.all([
    params,
    searchParams,
    requireAuthor(),
    getFranchiseOptions(),
    getMediaCarrierOptions(),
    getMediaTypeOptions(),
  ]);
  const mediaItemId = Number(id);

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const [item, metadata] = await Promise.all([
    getAuthorMediaItemForEdit(author.id, mediaItemId),
    getMediaItemMetadata(mediaItemId),
  ]);
  const errorMessage = getAuthorMediaFormErrorMessage(error);

  if (!item) {
    notFound();
  }

  if (!isAuthorEditablePublicationStatus(item.publicationStatus)) {
    notFound();
  }

  return (
    <div className="grid gap-6">
      <AuthorToasts
        clearParams={["error"]}
        messages={
          errorMessage
            ? [{ id: error ?? "form-error", tone: "error", text: errorMessage }]
            : []
        }
      />
      <div>
        <h2 className="font-serif text-3xl leading-none text-stone-950">Редактировать запись</h2>
        <p className="mt-2 text-sm text-stone-600">
          Статус: {PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus].toLowerCase()}.
        </p>
      </div>

      {item.adminNote ? (
        <Alert>
          {item.adminNote}
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-4 sm:p-5">
          <MediaItemForm
            action={updateAuthorMediaItemAction}
            submitLabel="Сохранить"
            franchises={franchises}
            mediaCarriers={mediaCarriers}
            mediaTypes={mediaTypes}
            canCreateFranchise={canAuthorCreateFranchise({
              canPublishMediaWithoutReview: author.canPublishMediaWithoutReview,
            })}
            values={item}
            metadata={metadata}
          />
        </CardContent>
      </Card>
    </div>
  );
}
