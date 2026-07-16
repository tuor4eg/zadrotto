import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, Unlink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tooltip } from "@/components/ui/tooltip";
import {
  getAdminFranchiseById,
  getAdminMediaItemsAvailableForFranchise,
  getAdminMediaItemsByFranchiseId,
} from "@/db/queries/franchises";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getMediaTypeLabel } from "@/lib/media/types";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/media/publication-status";
import {
  deleteFranchiseAction,
  removeMediaItemFromFranchiseAction,
  updateFranchiseAction,
} from "../../actions";
import { EmptyState, PageHeader } from "../../../admin-ui";
import { FranchiseForm } from "../../franchise-form";
import { MediaItemFranchisePicker } from "../../media-item-franchise-picker";
import { formatMediaItemsCount, getFranchiseErrorMessage } from "../../messages";

type EditFranchisePageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    attached?: string;
    detached?: string;
    updated?: string;
    error?: string;
  }>;
};

function parseFranchiseId(value: string) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function AdminFranchiseMediaCoverThumb({
  coverUrl,
  title,
}: {
  coverUrl: string | null;
  title: string;
}) {
  if (!coverUrl) {
    return (
      <span
        aria-label={`Обложка не добавлена: ${title}`}
        className="inline-flex h-9 w-7 shrink-0 items-center justify-center rounded-sm border border-dashed border-stone-300 bg-stone-50 text-[9px] font-medium uppercase leading-none text-stone-400"
        title="Обложка не добавлена"
      >
        нет
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverUrl}
      alt={`Обложка: ${title}`}
      className="h-9 w-7 shrink-0 rounded-sm border border-stone-200 bg-stone-100 object-cover shadow-sm"
      loading="lazy"
    />
  );
}

export default async function EditFranchisePage({
  params,
  searchParams,
}: EditFranchisePageProps) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const franchiseId = parseFranchiseId(rawId);

  if (!franchiseId) {
    notFound();
  }

  const [franchise, mediaItems, availableMediaItems, mediaTypes] = await Promise.all([
    getAdminFranchiseById(franchiseId),
    getAdminMediaItemsByFranchiseId(franchiseId),
    getAdminMediaItemsAvailableForFranchise(franchiseId),
    getMediaTypeOptions(),
  ]);

  if (!franchise) {
    notFound();
  }

  const canDelete = mediaItems.length === 0;

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0">
        <PageHeader
          title="Редактирование серии"
          description={franchise.title}
          aside={
            <Link
              href="/admin/franchises"
              className={`${buttonVariants({ variant: "outline" })} max-sm:hidden`}
            >
              <ArrowLeft />
              Назад
            </Link>
          }
        />

        <Card className="mt-5">
          <CardContent className="pt-5">
            <FranchiseForm
              action={updateFranchiseAction}
              submitLabel="Сохранить"
              publicHref={franchise.publicationStatus === "published" ? `/franchises/${franchise.code}` : null}
              values={franchise}
              errorMessage={getFranchiseErrorMessage(query.error)}
              successMessage={
                query.updated === "1"
                  ? "Серия сохранена."
                  : query.attached === "1"
                    ? "Запись добавлена в серию."
                    : query.detached === "1"
                      ? "Запись убрана из серии."
                      : null
              }
            />
          </CardContent>
        </Card>

        <Card className="mt-5">
          <CardContent className="grid gap-3 pt-5">
            <div>
              <h2 className="text-sm font-medium text-stone-950">Удаление серии</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                Серию можно удалить только если к ней не привязаны записи.
              </p>
            </div>
            <Tooltip
              className="w-full"
              label={canDelete ? "Удалить" : "Нельзя удалить: есть записи"}
            >
              <ConfirmAction
                action={deleteFranchiseAction}
                disabled={!canDelete}
                fields={[{ name: "franchiseId", value: franchise.id }]}
                title="Удалить серию?"
                description={`Серия «${franchise.title}» будет удалена. Это возможно только если к ней не привязаны записи.`}
                triggerLabel="Удалить серию"
                triggerAriaLabel={`Удалить серию ${franchise.title}`}
                triggerIcon={<Trash2 />}
                confirmLabel="Удалить серию"
                className="w-full"
              />
            </Tooltip>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-end justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Записи</CardTitle>
          <Badge variant="outline">
            {formatMediaItemsCount(mediaItems.length)}
          </Badge>
        </CardHeader>

        <CardContent>
          <MediaItemFranchisePicker
            franchiseId={franchise.id}
            items={availableMediaItems}
            mediaTypes={mediaTypes}
          />

          {mediaItems.length === 0 ? (
            <EmptyState className="p-5">В этой серии пока нет записей.</EmptyState>
          ) : (
            <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
              {mediaItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 p-3">
                  <AdminFranchiseMediaCoverThumb
                    coverUrl={item.coverThumbUrl ?? item.coverUrl}
                    title={item.title}
                  />

                  <Link
                    href={`/admin/media/${item.id}/edit`}
                    className="min-w-0 flex-1 rounded-md outline-none transition-colors hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-stone-900/20"
                  >
                    <div className="text-sm font-medium text-stone-950">{item.title}</div>
                    {item.originalTitle ? (
                      <div className="mt-1 truncate text-xs text-stone-500">{item.originalTitle}</div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="default">{getMediaTypeLabel(item.mediaType, mediaTypes)}</Badge>
                      {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
                      <Badge variant="outline">
                        {PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus]}
                      </Badge>
                      {item.franchisePublicationStatus !== "published" ? (
                        <Badge variant="warning">
                          Связь: {PUBLICATION_STATUS_VALUE_LABELS[item.franchisePublicationStatus]}
                        </Badge>
                      ) : null}
                    </div>
                  </Link>

                  <div className="flex shrink-0 gap-1.5">
                    <Tooltip label="Редактировать запись">
                      <Link
                        href={`/admin/media/${item.id}/edit`}
                        className={buttonVariants({ variant: "outline", size: "icon" })}
                        aria-label={`Редактировать запись ${item.title}`}
                      >
                        <Pencil />
                      </Link>
                    </Tooltip>

                    <form action={removeMediaItemFromFranchiseAction} className="shrink-0">
                      <input type="hidden" name="franchiseId" value={franchise.id} />
                      <input type="hidden" name="mediaItemId" value={item.id} />
                      <Tooltip label="Убрать из серии">
                        <Button
                          type="submit"
                          variant="destructive"
                          size="icon"
                          aria-label={`Убрать запись ${item.title} из серии`}
                        >
                          <Unlink />
                        </Button>
                      </Tooltip>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
