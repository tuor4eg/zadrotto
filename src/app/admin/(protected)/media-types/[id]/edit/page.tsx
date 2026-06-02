import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMediaTypeById } from "@/db/queries/media-types";
import { PageHeader } from "../../../admin-ui";
import { updateMediaTypeAction } from "../../actions";
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

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Редактирование типа"
        description={mediaType.name}
        aside={
          <Link href="/admin/media-types" className={buttonVariants({ variant: "outline" })}>
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
    </div>
  );
}
