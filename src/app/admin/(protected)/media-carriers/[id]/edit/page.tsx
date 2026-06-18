import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMediaCarrierById } from "@/db/queries/media-carriers";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { PageHeader } from "../../../admin-ui";
import { updateMediaCarrierAction } from "../../actions";
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
    </div>
  );
}
