import { notFound } from "next/navigation";

import { getFranchiseOptions } from "@/db/queries/franchises";
import { getAuthorMediaItemForEdit } from "@/db/queries/media-items";
import { isAuthorEditablePublicationStatus } from "@/lib/author-media-form";
import { requireAuthor } from "@/lib/author-auth";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/publication-status";
import { updateAuthorMediaItemAction } from "../../actions";
import { MediaItemForm } from "../../media-item-form";

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
  const [{ id }, { error }, author, franchises] = await Promise.all([
    params,
    searchParams,
    requireAuthor(),
    getFranchiseOptions(),
  ]);
  const mediaItemId = Number(id);

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const item = await getAuthorMediaItemForEdit(author.id, mediaItemId);

  if (!item) {
    notFound();
  }

  if (!isAuthorEditablePublicationStatus(item.publicationStatus)) {
    notFound();
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-950">Редактировать запись</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Статус: {PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus].toLowerCase()}.
        </p>
      </div>

      {item.adminNote ? (
        <div className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          {item.adminNote}
        </div>
      ) : null}

      <section className="border border-zinc-200 p-4 sm:p-5">
        <MediaItemForm
          action={updateAuthorMediaItemAction}
          submitLabel="Сохранить"
          franchises={franchises}
          values={item}
          error={error}
        />
      </section>
    </div>
  );
}
