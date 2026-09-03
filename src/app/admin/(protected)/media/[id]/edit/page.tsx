import Link from "next/link";
import { ArrowLeft, Check, Eye, EyeOff, FileText, RotateCcw, Trash2, X } from "lucide-react";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState, PageHeader } from "@/app/admin/(protected)/admin-ui";
import {
  deleteAdminMediaItemAction,
  updateAdminMediaItemAction,
  updateAdminMediaItemPublicationStatusAction,
} from "@/app/admin/(protected)/media/actions";
import { AdminMediaForm } from "@/app/admin/(protected)/media/media-form";
import { getAdminMediaErrorMessage } from "@/app/admin/(protected)/media/messages";
import { reviewAuthorMediaItemAction } from "@/app/admin/(protected)/media-review/actions";
import { getAuthorOptions } from "@/db/queries/authors";
import { isAiScenarioEnabled } from "@/db/queries/ai-scenarios";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getAdminFranchiseOptions } from "@/db/queries/franchises";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getMediaItemMetadata } from "@/db/queries/media-item-metadata";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getAdminMediaItemForEdit } from "@/db/queries/media-items";
import { getMediaItemCollectionReferences } from "@/db/queries/editorial-collections";
import { AI_SCENARIO_KEYS } from "@/lib/ai/scenarios/catalog";
import { getMediaTypeLabel } from "@/lib/media/types";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/media/publication-status";

type EditAdminMediaPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    created?: string;
    error?: string;
    updated?: string;
  }>;
};

function getStatusBadgeVariant(status: keyof typeof PUBLICATION_STATUS_VALUE_LABELS) {
  if (status === "published") {
    return "positive" as const;
  }

  if (status === "submitted") {
    return "warning" as const;
  }

  if (status === "rejected") {
    return "destructive" as const;
  }

  return "outline" as const;
}

function PublicationStatusButton({
  mediaItemId,
  published,
  disabled = false,
}: {
  mediaItemId: number;
  published: boolean;
  disabled?: boolean;
}) {
  return (
    <form action={updateAdminMediaItemPublicationStatusAction}>
      <input type="hidden" name="mediaItemId" value={mediaItemId} />
      <input type="hidden" name="nextStatus" value={published ? "private" : "published"} />
      <Button
        type="submit"
        variant={published ? "destructive" : "positive"}
        className="w-full"
        disabled={disabled}
      >
        {published ? <EyeOff /> : <RotateCcw />}
        {published ? "Снять с публикации" : "Вернуть на публикацию"}
      </Button>
    </form>
  );
}

function ReviewButton({
  mediaItemId,
  decision,
}: {
  mediaItemId: number;
  decision: "published" | "rejected";
}) {
  const approved = decision === "published";

  return (
    <form action={reviewAuthorMediaItemAction}>
      <input type="hidden" name="mediaItemId" value={mediaItemId} />
      <input type="hidden" name="decision" value={decision} />
      <Button
        type="submit"
        variant={approved ? "positive" : "destructive"}
        className="w-full"
      >
        {approved ? <Check /> : <X />}
        {approved ? "Одобрить" : "Отклонить"}
      </Button>
    </form>
  );
}

export default async function EditAdminMediaPage({
  params,
  searchParams,
}: EditAdminMediaPageProps) {
  const [
    { id },
    query,
    authors,
    franchises,
    mediaCarriers,
    mediaTypes,
    archiveSettings,
    canSuggestFranchises,
  ] = await Promise.all([
    params,
    searchParams,
    getAuthorOptions(),
    getAdminFranchiseOptions(),
    getMediaCarrierOptions(),
    getMediaTypeOptions(),
    getArchiveSettings(),
    isAiScenarioEnabled(AI_SCENARIO_KEYS.SUGGEST_SERIES),
  ]);
  const mediaItemId = Number(id);

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const [item, metadata, collectionReferences] = await Promise.all([
    getAdminMediaItemForEdit(mediaItemId),
    getMediaItemMetadata(mediaItemId),
    getMediaItemCollectionReferences(mediaItemId),
  ]);

  if (!item) {
    notFound();
  }

  const isPublished = item.publicationStatus === "published";
  const successMessage =
    query.created === "1"
      ? "Запись создана."
      : query.updated === "1"
        ? "Запись сохранена."
        : query.updated === "published"
          ? "Запись опубликована."
          : query.updated === "unpublished"
            ? "Запись снята с публикации."
            : null;

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0">
        <PageHeader
          title="Редактирование записи"
          description={item.title}
          aside={
            <Link
              href="/admin/media"
              className={`${buttonVariants({ variant: "outline" })} max-sm:hidden`}
            >
              <ArrowLeft />
              Назад
            </Link>
          }
        />

        {item.adminNote ? (
          <Alert variant="warning" className="mt-5">
            {item.adminNote}
          </Alert>
        ) : null}

        <Card className="mt-5">
          <CardContent className="pt-5">
            <AdminMediaForm
              action={updateAdminMediaItemAction}
              submitLabel="Сохранить"
              authors={authors}
              franchises={franchises}
              mediaCarriers={mediaCarriers}
              mediaTypes={mediaTypes}
              maxTitleAliases={archiveSettings.maxTitleAliases}
              canSuggestFranchises={canSuggestFranchises}
              requireAuthor
              values={item}
              metadata={metadata}
              errorMessage={getAdminMediaErrorMessage(query.error)}
              successMessage={successMessage}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="grid gap-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-stone-100 text-stone-600">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-stone-950">{item.title}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{getMediaTypeLabel(item.mediaType, mediaTypes)}</Badge>
            <Badge variant={getStatusBadgeVariant(item.publicationStatus)}>
              {PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus]}
            </Badge>
            {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
          </div>

          <div className="grid gap-2 border-t border-stone-100 pt-4">
            {item.publicationStatus === "submitted" ? (
              <>
                <ReviewButton mediaItemId={item.id} decision="published" />
                <ReviewButton mediaItemId={item.id} decision="rejected" />
              </>
            ) : (
              <>
                {isPublished ? (
                  <Link
                    href={`/media/${item.code}`}
                    className={`${buttonVariants({ variant: "outline" })} w-full`}
                  >
                    <Eye />
                    Смотреть на сайте
                  </Link>
                ) : (
                  <Button type="button" variant="outline" disabled className="w-full">
                    <Eye />
                    Карточка не опубликована
                  </Button>
                )}

                {collectionReferences.length > 0 ? (
                  <Alert variant="warning">
                    Запись используется в подборках: {collectionReferences.map((collection, index) => (
                      <span key={collection.id}>{index ? ", " : ""}<Link className="underline" href={`/admin/collections/${collection.id}/edit`}>{collection.title}</Link></span>
                    ))}.
                  </Alert>
                ) : null}
                <PublicationStatusButton mediaItemId={item.id} published={isPublished} disabled={isPublished && collectionReferences.length > 0} />
                <Tooltip
                  className="w-full"
                  label={
                    collectionReferences.length > 0
                      ? "Сначала удалите запись из всех подборок"
                      : isPublished
                      ? "Сначала снимите запись с публикации"
                      : "Удалить вместе со связанными материалами"
                  }
                >
                  <ConfirmAction
                    action={deleteAdminMediaItemAction}
                    disabled={isPublished || collectionReferences.length > 0}
                    confirmLabel="Удалить"
                    description={`Запись «${item.title}» будет удалена вместе со связанными оценками, рецензиями и пользовательскими отметками. Это действие нельзя отменить.`}
                    fields={[{ name: "mediaItemId", value: item.id }]}
                    title="Удалить запись?"
                    triggerAriaLabel={`Удалить запись ${item.title}`}
                    triggerIcon={<Trash2 />}
                    triggerLabel="Удалить"
                    triggerVariant="destructive"
                    className="w-full"
                  />
                </Tooltip>
              </>
            )}
          </div>

          <div className="space-y-2 text-sm text-stone-600">
            {item.authorName ? (
              <p>Автор: {item.authorName}</p>
            ) : (
              <EmptyState className="p-4 text-left">Запись добавлена не через авторский профиль.</EmptyState>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
