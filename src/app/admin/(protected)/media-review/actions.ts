"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reviewSubmittedAuthorMediaItem } from "@/db/queries/media-items";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminFormErrorCode } from "@/lib/app-error-messages";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function reviewAuthorMediaItemAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const mediaItemId = Number(getFormString(formData, "mediaItemId"));
  const decision = getFormString(formData, "decision");

  if (
    !Number.isInteger(mediaItemId) ||
    mediaItemId <= 0 ||
    (decision !== "published" && decision !== "rejected")
  ) {
    redirect("/admin/media-review?error=invalid-review");
  }

  let item;

  try {
    item = await reviewSubmittedAuthorMediaItem({
      mediaItemId,
      adminUserId: adminUser.id,
      decision,
    });
  } catch (error) {
    console.error(error);
    redirect(`/admin/media-review?error=${getAdminFormErrorCode(error)}`);
  }

  if (!item) {
    redirect("/admin/media-review?error=invalid-review");
  }

  revalidatePath("/admin/media-review");
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/media-review/${mediaItemId}`);
  revalidatePath("/author/media");

  if (item.publicationStatus === "published") {
    revalidatePath("/");
    revalidatePath(`/media/${item.code}`);
    redirect("/admin/media-review?approved=1");
  }

  redirect("/admin/media-review?rejected=1");
}
