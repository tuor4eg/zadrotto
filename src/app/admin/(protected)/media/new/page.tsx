import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthorOptions } from "@/db/queries/authors";
import { isAiScenarioEnabled } from "@/db/queries/ai-scenarios";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getAdminFranchiseOptions } from "@/db/queries/franchises";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { AI_SCENARIO_KEYS } from "@/lib/ai/scenarios/catalog";
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
  const [
    { error },
    authors,
    franchises,
    mediaCarriers,
    mediaTypes,
    archiveSettings,
    canSuggestFranchises,
  ] = await Promise.all([
    searchParams,
    getAuthorOptions(),
    getAdminFranchiseOptions(),
    getMediaCarrierOptions(),
    getMediaTypeOptions(),
    getArchiveSettings(),
    isAiScenarioEnabled(AI_SCENARIO_KEYS.SUGGEST_SERIES),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Новая запись"
        description="Архивная запись сразу появится в опубликованной картотеке."
        aside={
          <Link
            href="/admin/media"
            className={`${buttonVariants({ variant: "outline" })} max-sm:hidden`}
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
            mediaTypes={mediaTypes}
            maxTitleAliases={archiveSettings.maxTitleAliases}
            canSuggestFranchises={canSuggestFranchises}
            requireAuthor
            values={{ releaseYear: new Date().getFullYear() }}
            errorMessage={getAdminMediaErrorMessage(error)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
