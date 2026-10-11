import { reopenGenreMappingAction } from "../../actions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminGenreById } from "@/db/queries/genres";
import { getPublishedFranchiseOptions } from "@/db/queries/franchises";
import { parseGenreId } from "@/lib/media/admin-genres";
import { PageHeader } from "../../../admin-ui";
import { updateGenreNameAction } from "../../actions";
import { GenreForm } from "../../genre-form";
import { getGenreErrorMessage } from "../../messages";
import { GenreProviderVariants } from "../../provider-variants";

export default async function EditGenrePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const id = parseGenreId(rawId);
  if (id === null) notFound();
  const [genre, publishedOptions] = await Promise.all([getAdminGenreById(id), getPublishedFranchiseOptions()]);
  if (!genre) notFound();
  const franchiseOptions = genre.replacementFranchise && !publishedOptions.some((option) => option.id === genre.replacementFranchiseId)
    ? [...publishedOptions, { ...genre.replacementFranchise, originalTitle: null }]
    : publishedOptions;
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-5">
      <PageHeader title="Редактирование жанра" description={genre.name} aside={
        <Link href={genre.replacementFranchiseId ? "/admin/genres?tab=series" : "/admin/genres"} className={buttonVariants({ variant: "outline" })}><ArrowLeft />Назад</Link>
      } />
      {!genre.isActive ? <div><Badge variant="warning">Неактивен</Badge></div> : null}
      <Card><CardContent className="pt-5">
        <GenreForm key={`${genre.id}:${genre.replacementFranchiseId}`} genre={genre} franchiseOptions={franchiseOptions} action={updateGenreNameAction} errorMessage={getGenreErrorMessage(query.error)} updated={query.updated === "1"} />
      </CardContent></Card>
      <Card><CardContent className="grid gap-3 pt-5">
        <h3 className="text-sm font-medium text-stone-950">Варианты у провайдеров</h3>
        <GenreProviderVariants groups={genre.providerVariants} reopenAction={reopenGenreMappingAction} />
      </CardContent></Card>
    </div>
  );
}
