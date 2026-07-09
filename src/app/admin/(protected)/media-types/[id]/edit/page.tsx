import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tooltip } from "@/components/ui/tooltip";
import { getMediaTypeById } from "@/db/queries/media-types";
import { PageHeader } from "../../../admin-ui";
import { deleteMediaTypeAction, updateMediaTypeAction } from "../../actions";
import { MediaTypeForm } from "../../media-type-form";
import { getMediaTypeErrorMessage } from "../../messages";

type EditMediaTypePageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
    updated?: string;
  }>;
};

function parseMediaTypeId(value: string) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function EditMediaTypePage({
  params,
  searchParams,
}: EditMediaTypePageProps) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const mediaTypeId = parseMediaTypeId(rawId);

  if (!mediaTypeId) {
    notFound();
  }

  const mediaType = await getMediaTypeById(mediaTypeId);

  if (!mediaType) {
    notFound();
  }

  const canDelete = mediaType.mediaItemsCount === 0 && mediaType.mediaCarriersCount === 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Редактирование типа"
        description={mediaType.name}
        aside={
          <Link
            href="/admin/media-types"
            className={`${buttonVariants({ variant: "outline" })} max-sm:hidden`}
          >
            <ArrowLeft />
            Назад
          </Link>
        }
      />

      <Card className="mt-5">
        <CardContent className="pt-5">
          <MediaTypeForm
            action={updateMediaTypeAction}
            submitLabel="Сохранить"
            values={mediaType}
            errorMessage={getMediaTypeErrorMessage(query.error)}
            successMessage={query.updated === "1" ? "Тип сохранен." : null}
          />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="grid gap-3 pt-5">
          <div>
            <h2 className="text-sm font-medium text-stone-950">Удаление типа</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Тип можно удалить только если он не выбран у записей и носителей.
            </p>
          </div>
          <Tooltip
            className="w-full"
            label={canDelete ? "Удалить" : "Нельзя удалить: тип используется"}
          >
            <ConfirmAction
              action={deleteMediaTypeAction}
              disabled={!canDelete}
              fields={[{ name: "mediaTypeId", value: mediaType.id }]}
              title="Удалить тип?"
              description={`Тип «${mediaType.name}» будет удален. Это возможно только если он не выбран у записей и носителей.`}
              triggerLabel="Удалить тип"
              triggerAriaLabel={`Удалить тип ${mediaType.name}`}
              triggerIcon={<Trash2 />}
              confirmLabel="Удалить тип"
              className="w-full"
            />
          </Tooltip>
        </CardContent>
      </Card>
    </div>
  );
}
