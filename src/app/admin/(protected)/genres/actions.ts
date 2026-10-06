"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { updateGenreName } from "@/db/queries/genres";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAdminFormErrorCode } from "@/lib/common/app-error-messages";
import { parseGenreId, parseGenreName } from "@/lib/media/admin-genres";

export async function updateGenreNameAction(formData: FormData) {
  await requireAdminUser();
  const id = parseGenreId(formData.get("genreId"));
  if (id === null) redirect("/admin/genres?error=invalid-genre");
  const name = parseGenreName(formData.get("name"));
  if (name === null) redirect(`/admin/genres/${id}/edit?error=required`);

  let genre;
  try {
    genre = await updateGenreName(id, name);
  } catch (error) {
    console.error("Failed to rename genre", error);
    redirect(`/admin/genres/${id}/edit?error=${getAdminFormErrorCode(error)}`);
  }
  if (!genre) redirect("/admin/genres?error=invalid-genre");

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
