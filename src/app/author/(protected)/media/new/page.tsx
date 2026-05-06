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
        <h2 className="text-2xl font-semibold text-zinc-950">Новая запись</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Запись сохранится приватной и не появится в публичном архиве.
        </p>
      </div>

      <section className="border border-zinc-200 p-4 sm:p-5">
        <MediaItemForm
          action={createAuthorMediaItemAction}
          submitLabel="Создать"
          franchises={franchises}
          error={error}
        />
      </section>
    </div>
  );
}
