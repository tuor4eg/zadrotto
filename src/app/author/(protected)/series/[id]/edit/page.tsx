import { notFound } from "next/navigation";
import { requireAuthor } from "@/lib/auth/author-auth";
import { canManageFranchises } from "@/lib/franchises/access";
import { getAdminFranchiseById, getAdminFranchiseParentOptions, getPublishedFranchiseOptions } from "@/db/queries/franchises";
import { FranchiseForm } from "@/app/admin/(protected)/series/franchise-form";
import { updateTrustedFranchiseAction } from "../../actions";

export default async function EditTrustedFranchisePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const author = await requireAuthor();
  if (!canManageFranchises(author)) notFound();
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const [item, allParentOptions, publishedOptions] = await Promise.all([getAdminFranchiseById(id), getAdminFranchiseParentOptions(id), getPublishedFranchiseOptions()]);
  const publishedIds = new Set(publishedOptions.map(row => row.id));
  const parentOptions = allParentOptions.filter(row => publishedIds.has(row.id)).map(row => ({ ...row, path: row.title }));
  if (!item || item.publicationStatus !== "published") notFound();
  return <section className="mx-auto grid max-w-2xl gap-5"><h1 className="text-xl font-semibold">Редактирование франшизы или цикла</h1>
    <FranchiseForm parentEditBase="/author/series" values={item} parentOptions={parentOptions} action={updateTrustedFranchiseAction} submitLabel="Сохранить"
      publicHref={`/archive?series=${encodeURIComponent(item.code)}`} errorMessage={query.error ? "Не удалось сохранить изменения. Проверьте название и родительскую франшизу." : null} successMessage={query.updated ? "Изменения сохранены." : null} />
  </section>;
}
