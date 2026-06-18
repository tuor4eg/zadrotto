import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../../admin-ui";
import { createMediaTypeAction } from "../actions";
import { MediaTypeForm } from "../media-type-form";
import { getMediaTypeErrorMessage } from "../messages";

type NewMediaTypePageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewMediaTypePage({ searchParams }: NewMediaTypePageProps) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Новый тип"
        description="Тип записи для каталога и форм добавления."
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
            action={createMediaTypeAction}
            submitLabel="Создать"
            errorMessage={getMediaTypeErrorMessage(error)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
