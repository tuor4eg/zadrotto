import { Card, CardContent } from "@/components/ui/card";
import { getFranchiseOptions } from "@/db/queries/franchises";
import { createAuthorMediaItemAction } from "../actions";
import { MediaItemForm } from "../media-item-form";

type NewAuthorMediaPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewAuthorMediaPage({ searchParams }: NewAuthorMediaPageProps) {
  const [{ error }, franchises] = await Promise.all([searchParams, getFranchiseOptions()]);

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-serif text-3xl leading-none text-stone-950">Новая запись</h2>
        <p className="mt-2 text-sm text-stone-600">
          Запись сохранится приватной и не появится в публичном архиве.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
        <MediaItemForm
          action={createAuthorMediaItemAction}
          submitLabel="Создать"
          franchises={franchises}
          error={error}
        />
        </CardContent>
      </Card>
    </div>
  );
}
