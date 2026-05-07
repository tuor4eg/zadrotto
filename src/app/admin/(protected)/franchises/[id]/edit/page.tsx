import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Unlink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import {
  getAdminFranchiseById,
  getAdminMediaItemsAvailableForFranchise,
  getAdminMediaItemsByFranchiseId,
} from "@/db/queries/franchises";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/publication-status";
import { removeMediaItemFromFranchiseAction, updateFranchiseAction } from "../../actions";
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

export default async function EditFranchisePage({
  params,
  searchParams,
}: EditFranchisePageProps) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const franchiseId = parseFranchiseId(rawId);

  if (!franchiseId) {
    notFound();
  }

  const [franchise, mediaItems, availableMediaItems] = await Promise.all([
    getAdminFranchiseById(franchiseId),
    getAdminMediaItemsByFranchiseId(franchiseId),
    getAdminMediaItemsAvailableForFranchise(franchiseId),
  ]);

  if (!franchise) {
    notFound();
  }

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0">
        <PageHeader
          title="Редактирование серии"
          description={franchise.title}
          aside={
            <Link
              href="/admin/franchises"
              className={buttonVariants({ variant: "outline" })}
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
          />

          {mediaItems.length === 0 ? (
            <EmptyState className="p-5">В этой серии пока нет записей.</EmptyState>
          ) : (
            <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
              {mediaItems.map((item) => (
                <div key={item.id} className="flex items-start gap-2 p-3">
                  <Link
                    href={`/admin/media/${item.id}/edit`}
                    className="min-w-0 flex-1 rounded-md outline-none transition-colors hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-stone-900/20"
                  >
                    <div className="text-sm font-medium text-stone-950">{item.title}</div>
                    {item.originalTitle ? (
                      <div className="mt-1 truncate text-xs text-stone-500">{item.originalTitle}</div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="default">{MEDIA_TYPE_LABELS[item.mediaType]}</Badge>
                      {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
                      <Badge variant="outline">
                        {PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus]}
                      </Badge>
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
