import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/app/admin/(protected)/admin-ui";
import { updateAdminMediaItemAction } from "@/app/admin/(protected)/media/actions";
import { AdminMediaForm } from "@/app/admin/(protected)/media/media-form";
import { getAdminMediaErrorMessage } from "@/app/admin/(protected)/media/messages";
import { getAuthorOptions } from "@/db/queries/authors";
import { getFranchiseOptions } from "@/db/queries/franchises";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getAdminMediaItemForEdit } from "@/db/queries/media-items";
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

export default async function EditAdminMediaPage({
  params,
  searchParams,
}: EditAdminMediaPageProps) {
  const [{ id }, query, authors, franchises, mediaCarriers, mediaTypes] = await Promise.all([
    params,
    searchParams,
    getAuthorOptions(),
    getFranchiseOptions(),
    getMediaCarrierOptions(),
    getMediaTypeOptions(),
  ]);
  const mediaItemId = Number(id);

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const item = await getAdminMediaItemForEdit(mediaItemId);

  if (!item) {
    notFound();
  }

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0">
        <PageHeader
          title="Редактирование записи"
          description={item.title}
          aside={
            <Link
              href="/admin/media"
              className={buttonVariants({ variant: "outline" })}
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
              requireAuthor
              values={item}
              errorMessage={getAdminMediaErrorMessage(query.error)}
              successMessage={
                query.created === "1"
                  ? "Запись создана."
                  : query.updated === "1"
                    ? "Запись сохранена."
                    : null
              }
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
            <Badge
              variant={item.publicationStatus === "published" ? "positive" : item.publicationStatus === "submitted" ? "warning" : item.publicationStatus === "rejected" ? "destructive" : "outline"}
            >
              {PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus]}
            </Badge>
            {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
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
