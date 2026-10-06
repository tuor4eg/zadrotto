"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveGenreRequest, retryGenreRequest } from "@/db/queries/genre-requests";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parseGenreRequestDecision } from "@/lib/media/genre-request-form";
import { parseGenreId } from "@/lib/media/admin-genres";

function invalidateGenreViews() {
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/genres");
  revalidatePath("/media/[code]", "page");
  revalidatePath("/reviews/[id]", "page");
  revalidatePath("/admin/media/[id]/edit", "page");
  revalidatePath("/author/media/[id]/edit", "page");
  revalidatePath("/admin/media/new");
  revalidatePath("/author/media/new");
  revalidatePath("/api/admin/media-browser");
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "save";
}

export async function resolveGenreRequestAction(formData: FormData) {
  const admin = await requireAdminUser();
  const requestId = parseGenreId(formData.get("requestId"));
  if (!requestId) redirect("/admin/genre-requests?error=invalid");
  const input = parseGenreRequestDecision(formData);
  if (!input) redirect(`/admin/genre-requests/${requestId}?error=invalid`);
  try {
    await resolveGenreRequest({ ...input, adminId: admin.id });
  } catch (error) {
    console.error("Не удалось принять решение по жанру.", error);
    redirect(`/admin/genre-requests/${requestId}?error=${encodeURIComponent(errorCode(error))}`);
  }
  invalidateGenreViews();
  redirect(`/admin/genre-requests/${requestId}?saved=1`);
}

export async function retryGenreRequestAction(formData: FormData) {
  const admin = await requireAdminUser();
  const requestId = parseGenreId(formData.get("requestId"));
  if (!requestId) redirect("/admin/genre-requests?error=invalid");
  try {
    await retryGenreRequest({ requestId, adminId: admin.id });
  } catch (error) {
    console.error("Не удалось повторить применение жанра.", error);
    redirect(`/admin/genre-requests/${requestId}?error=${encodeURIComponent(errorCode(error))}`);
  }
  invalidateGenreViews();
  redirect(`/admin/genre-requests/${requestId}?retried=1`);
}
