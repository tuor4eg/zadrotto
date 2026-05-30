import { Card, CardContent } from "@/components/ui/card";
import { getFranchiseOptions } from "@/db/queries/franchises";
import { AuthorToasts } from "../../author-toasts";
import { createAuthorMediaItemAction } from "../actions";
import { getAuthorMediaFormErrorMessage, MediaItemForm } from "../media-item-form";

type NewAuthorMediaPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewAuthorMediaPage({ searchParams }: NewAuthorMediaPageProps) {
  const [{ error }, franchises] = await Promise.all([searchParams, getFranchiseOptions()]);
  const errorMessage = getAuthorMediaFormErrorMessage(error);

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
        <p className="mt-2 text-sm text-stone-600">
          Запись сохранится черновиком и не появится в публичном архиве.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
        <MediaItemForm
          action={createAuthorMediaItemAction}
          submitLabel="Создать"
          franchises={franchises}
        />
        </CardContent>
      </Card>
    </div>
  );
}
