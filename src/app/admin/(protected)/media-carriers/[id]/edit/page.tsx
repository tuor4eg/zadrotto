import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tooltip } from "@/components/ui/tooltip";
import { getMediaCarrierById } from "@/db/queries/media-carriers";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { PageHeader } from "../../../admin-ui";
import { deleteMediaCarrierAction, updateMediaCarrierAction } from "../../actions";
import { MediaCarrierForm } from "../../media-carrier-form";
import { getMediaCarrierErrorMessage } from "../../messages";

type EditMediaCarrierPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
    updated?: string;
  }>;
};

function parseCarrierId(value: string) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function EditMediaCarrierPage({
  params,
  searchParams,
}: EditMediaCarrierPageProps) {
  const [{ id: rawId }, query, mediaTypes] = await Promise.all([
    params,
    searchParams,
    getMediaTypeOptions(),
  ]);
  const carrierId = parseCarrierId(rawId);

  if (!carrierId) {
    notFound();
  }

  const carrier = await getMediaCarrierById(carrierId);

  if (!carrier) {
    notFound();
  }

  const canDelete = carrier.mediaItemsCount === 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Редактирование носителя"
        description={carrier.name}
        aside={
          <Link
            href="/admin/media-carriers"
            className={`${buttonVariants({ variant: "outline" })} max-sm:hidden`}
          >
            <ArrowLeft />
            Назад
          </Link>
        }
      />

      <Card className="mt-5">
        <CardContent className="pt-5">
          <MediaCarrierForm
            action={updateMediaCarrierAction}
            submitLabel="Сохранить"
            mediaTypes={mediaTypes}
            values={carrier}
            errorMessage={getMediaCarrierErrorMessage(query.error)}
            successMessage={query.updated === "1" ? "Носитель сохранен." : null}
          />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="grid gap-3 pt-5">
          <div>
            <h2 className="text-sm font-medium text-stone-950">Удаление носителя</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Носитель можно удалить только если он не выбран ни у одной записи.
            </p>
          </div>
          <Tooltip
            className="w-full"
            label={canDelete ? "Удалить" : "Нельзя удалить: носитель выбран в записях"}
          >
            <ConfirmAction
              action={deleteMediaCarrierAction}
              disabled={!canDelete}
              fields={[{ name: "carrierId", value: carrier.id }]}
              title="Удалить носитель?"
              description={`Носитель «${carrier.name}» будет удален. Это возможно только если он не выбран ни у одной записи.`}
              triggerLabel="Удалить носитель"
              triggerAriaLabel={`Удалить носитель ${carrier.name}`}
              triggerIcon={<Trash2 />}
              confirmLabel="Удалить носитель"
              className="w-full"
            />
          </Tooltip>
        </CardContent>
      </Card>
    </div>
  );
}
