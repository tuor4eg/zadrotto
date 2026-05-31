import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthorOptions } from "@/db/queries/authors";
import { getFranchiseOptions } from "@/db/queries/franchises";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { PageHeader } from "../../admin-ui";
import { createAdminMediaItemAction } from "../actions";
import { AdminMediaForm } from "../media-form";
import { getAdminMediaErrorMessage } from "../messages";

type NewAdminMediaPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewAdminMediaPage({ searchParams }: NewAdminMediaPageProps) {
  const [{ error }, authors, franchises, mediaCarriers] = await Promise.all([
    searchParams,
    getAuthorOptions(),
    getFranchiseOptions(),
    getMediaCarrierOptions(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Новая запись"
        description="Архивная запись сразу появится в опубликованной картотеке."
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

      <Card className="mt-5">
        <CardContent className="pt-5">
          <AdminMediaForm
            action={createAdminMediaItemAction}
            submitLabel="Создать"
            authors={authors}
            franchises={franchises}
            mediaCarriers={mediaCarriers}
            requireAuthor
            values={{ releaseYear: new Date().getFullYear() }}
            errorMessage={getAdminMediaErrorMessage(error)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
