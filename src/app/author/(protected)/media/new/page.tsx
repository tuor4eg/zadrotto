import { Card, CardContent } from "@/components/ui/card";
import { getFranchiseOptions } from "@/db/queries/franchises";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { canAuthorCreateFranchise } from "@/lib/authors/media-publication";
import { requireAuthor } from "@/lib/auth/author-auth";
import { parseAuthorMediaTypeFilter } from "@/lib/authors/media-filters";
import { AuthorToasts } from "../../author-toasts";
import { createAuthorMediaItemAction } from "../actions";
import { MediaItemForm } from "../media-item-form";
import { getAuthorMediaFormErrorMessage } from "../messages";

type NewAuthorMediaPageProps = {
  searchParams: Promise<{
    error?: string;
    type?: string;
  }>;
};

export default async function NewAuthorMediaPage({ searchParams }: NewAuthorMediaPageProps) {
  const author = await requireAuthor();
  const [params, franchises, mediaCarriers, mediaTypes] = await Promise.all([
    searchParams,
    getFranchiseOptions(author.id),
    getMediaCarrierOptions(),
    getMediaTypeOptions(),
  ]);
  const { error } = params;
  const initialMediaType = parseAuthorMediaTypeFilter(params.type, mediaTypes);
  const errorMessage = getAuthorMediaFormErrorMessage(error);
  const createAndSubmitLabel = author.canPublishMediaWithoutReview
    ? "Опубликовать"
    : "Отправить на модерацию";

  return (
    <div className="grid gap-6">
      <AuthorToasts
        clearParams={["error"]}
        messages={
          errorMessage
            ? [{ id: error ?? "form-error", tone: "error", text: errorMessage }]
            : []
        }
      />
      <div>
        <h2 className="font-serif text-3xl leading-none text-stone-950">Новая запись</h2>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <MediaItemForm
            action={createAuthorMediaItemAction}
            submitLabel="Сохранить черновик"
            franchises={franchises}
            mediaCarriers={mediaCarriers}
            mediaTypes={mediaTypes}
            values={initialMediaType === "all" ? undefined : { mediaType: initialMediaType }}
            createAndSubmitLabel={createAndSubmitLabel}
            canCreateFranchise={canAuthorCreateFranchise({
              canPublishFranchisesWithoutReview: author.canPublishFranchisesWithoutReview,
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
