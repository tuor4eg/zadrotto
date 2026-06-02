import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { PageHeader } from "../../admin-ui";
import { createMediaCarrierAction } from "../actions";
import { MediaCarrierForm } from "../media-carrier-form";
import { getMediaCarrierErrorMessage } from "../messages";

type NewMediaCarrierPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewMediaCarrierPage({ searchParams }: NewMediaCarrierPageProps) {
  const [{ error }, mediaTypes] = await Promise.all([searchParams, getMediaTypeOptions()]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Новый носитель"
        description="Формат или физический носитель для будущего скина карточки."
        aside={
          <Link
            href="/admin/media-carriers"
            className={buttonVariants({ variant: "outline" })}
          >
            <ArrowLeft />
            Назад
          </Link>
        }
      />

      <Card className="mt-5">
        <CardContent className="pt-5">
          <MediaCarrierForm
            action={createMediaCarrierAction}
            submitLabel="Создать"
            mediaTypes={mediaTypes}
            errorMessage={getMediaCarrierErrorMessage(error)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
