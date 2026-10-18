"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reopenPlatformMapping } from "@/db/queries/platform-requests";
import { updatePlatform } from "@/db/queries/platforms";
import { restorePlatformExclusion } from "@/db/queries/platform-exclusions";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAdminFormErrorCode } from "@/lib/common/app-error-messages";
import { parsePlatformId, parsePlatformName } from "@/lib/media/admin-platforms";

export async function restorePlatformExclusionAction(formData: FormData) {
  const admin = await requireAdminUser();
  const id = parsePlatformId(formData.get("exclusionId"));
  if (!id) redirect("/admin/platforms?tab=cancelled&error=restore");
  let requestId: number;
  try {
    requestId = await restorePlatformExclusion(id, admin.id);
  } catch {
    redirect("/admin/platforms?tab=cancelled&error=restore");
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/platforms");
  revalidatePath("/admin/platform-requests");
  redirect(`/admin/platform-requests/${requestId}`);
}

export async function updatePlatformNameAction(formData: FormData) {
  await requireAdminUser();
  const id = parsePlatformId(formData.get("platformId"));
  if (id === null) redirect("/admin/platforms?error=invalid-platform");
  const name = parsePlatformName(formData.get("name"));
  if (name === null) redirect(`/admin/platforms/${id}/edit?error=required`);

  let platform;
  try {
    platform = await updatePlatform(id, name);
  } catch (error) {
    console.error("Не удалось сохранить платформа", error);
    redirect(`/admin/platforms/${id}/edit?error=${getAdminFormErrorCode(error)}`);
  }
  if (!platform) redirect("/admin/platforms?error=invalid-platform");

  revalidatePath("/", "layout");
  revalidatePath("/admin/platforms");
  revalidatePath("/admin/platforms/[id]/edit", "page");
  revalidatePath("/media/[code]", "page");
  revalidatePath("/reviews/[id]", "page");
  revalidatePath("/admin/media/[id]/edit", "page");
  revalidatePath("/author/media/[id]/edit", "page");
  revalidatePath("/admin/media/new");
  revalidatePath("/author/media/new");
  revalidatePath("/api/admin/media-browser");
  redirect(`/admin/platforms/${id}/edit?updated=1`);
}

export async function reopenPlatformMappingAction(formData: FormData) {
  const admin = await requireAdminUser();
  const mappingId = parsePlatformId(formData.get("mappingId"));
  if (!mappingId) redirect("/admin/platforms?error=reopen");
  let requestId: number;
  try {
    ({ requestId } = await reopenPlatformMapping({ mappingId, adminId: admin.id }));
  } catch (error) {
    console.error("Не удалось вернуть вариант платформы в заявки.", error);
    redirect("/admin/platforms?error=reopen");
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin/platforms");
  revalidatePath("/admin/platform-requests");
  revalidatePath("/media/[code]", "page");
  revalidatePath("/reviews/[id]", "page");
  revalidatePath("/admin/media/[id]/edit", "page");
  revalidatePath("/author/media/[id]/edit", "page");
  revalidatePath("/admin/media/new");
  revalidatePath("/author/media/new");
  revalidatePath("/api/admin/media-browser");
  redirect(`/admin/platform-requests/${requestId}?reopened=1`);
}
