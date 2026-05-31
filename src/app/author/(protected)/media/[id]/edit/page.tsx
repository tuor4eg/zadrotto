import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { getFranchiseOptions } from "@/db/queries/franchises";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getAuthorMediaItemForEdit } from "@/db/queries/media-items";
import { isAuthorEditablePublicationStatus } from "@/lib/author-media-form";
import { requireAuthor } from "@/lib/author-auth";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/publication-status";
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
  const [{ id }, { error }, author, franchises, mediaCarriers] = await Promise.all([
    params,
    searchParams,
    requireAuthor(),
    getFranchiseOptions(),
    getMediaCarrierOptions(),
  ]);
  const mediaItemId = Number(id);

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const item = await getAuthorMediaItemForEdit(author.id, mediaItemId);
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
            values={item}
          />
        </CardContent>
      </Card>
    </div>
  );
}
