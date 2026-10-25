"use server";

import { enqueueJobRun } from "@/lib/jobs/queue";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reopenGenreMapping } from "@/db/queries/genre-requests";
import { updateGenre } from "@/db/queries/genres";
import { restoreGenreExclusion } from "@/db/queries/genre-exclusions";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAdminFormErrorCode } from "@/lib/common/app-error-messages";
import { parseGenreId, parseGenreName } from "@/lib/media/admin-genres";

export async function restoreGenreExclusionAction(formData: FormData) {
  const admin = await requireAdminUser();
  const id = parseGenreId(formData.get("exclusionId"));
  if (!id) redirect("/admin/genres?tab=cancelled&error=restore");
  let requestId: number;
  try {
    requestId = await restoreGenreExclusion(id, admin.id);
  } catch {
    redirect("/admin/genres?tab=cancelled&error=restore");
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/genres");
  revalidatePath("/admin/genre-requests");
  redirect(`/admin/genre-requests/${requestId}`);
}

export async function updateGenreNameAction(formData: FormData) {
  await requireAdminUser();
  const id = parseGenreId(formData.get("genreId"));
  if (id === null) redirect("/admin/genres?error=invalid-genre");
  const name = parseGenreName(formData.get("name"));
  if (name === null) redirect(`/admin/genres/${id}/edit?error=required`);
  const rawReplacementFranchiseId = formData.get("replacementFranchiseId");
  const replacementFranchiseId = rawReplacementFranchiseId === "" ? null : parseGenreId(rawReplacementFranchiseId);
  if (rawReplacementFranchiseId !== "" && replacementFranchiseId === null) {
    redirect(`/admin/genres/${id}/edit?error=invalid-series`);
  }

  let genre;
  try {
    genre = await updateGenre(id, name, replacementFranchiseId);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid-series") redirect(`/admin/genres/${id}/edit?error=invalid-series`);
    console.error("Не удалось сохранить жанр", error);
    redirect(`/admin/genres/${id}/edit?error=${getAdminFormErrorCode(error)}`);
  }
  if (!genre) redirect("/admin/genres?error=invalid-genre");

  revalidatePath("/", "layout");
  revalidatePath("/admin/genres");
  revalidatePath("/admin/genres/[id]/edit", "page");
  revalidatePath("/media/[code]", "page");
  revalidatePath("/reviews/[id]", "page");
  revalidatePath("/admin/media/[id]/edit", "page");
  revalidatePath("/author/media/[id]/edit", "page");
  revalidatePath("/admin/media/new");
  revalidatePath("/author/media/new");
  revalidatePath("/api/admin/media-browser");
  redirect(`/admin/genres/${id}/edit?updated=1`);
}

export async function reopenGenreMappingAction(formData: FormData) {
  const admin = await requireAdminUser();
  const mappingId = parseGenreId(formData.get("mappingId"));
  if (!mappingId) redirect("/admin/genres?error=reopen");
  let requestId: number;
  try {
    ({ requestId } = await reopenGenreMapping({ mappingId, adminId: admin.id }));
  } catch (error) {
    console.error("Не удалось вернуть вариант жанра в заявки.", error);
    redirect("/admin/genres?error=reopen");
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin/genres");
  revalidatePath("/admin/genre-requests");
  revalidatePath("/media/[code]", "page");
  revalidatePath("/reviews/[id]", "page");
  revalidatePath("/admin/media/[id]/edit", "page");
  revalidatePath("/author/media/[id]/edit", "page");
  revalidatePath("/admin/media/new");
  revalidatePath("/author/media/new");
  revalidatePath("/api/admin/media-browser");
  redirect(`/admin/genre-requests/${requestId}?reopened=1`);
}

export async function applyGenreSeriesAction(formData: FormData) {
  const admin = await requireAdminUser();
  const genreId = parseGenreId(formData.get("genreId"));
  if (!genreId) redirect("/admin/genres?error=invalid-genre");
  try { await enqueueJobRun({ type: "media.genre-series-apply", source: "manual", createdByAdminId: admin.id, payload: { genreId } }); }
  catch { redirect(`/admin/genres/${genreId}/edit?error=queue`); }
  revalidatePath("/admin/tools/jobs/current");
  redirect("/admin/tools/jobs/current");
}
