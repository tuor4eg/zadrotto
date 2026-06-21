"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reviewSubmittedAuthorMediaItem } from "@/db/queries/media-items";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAdminFormErrorCode } from "@/lib/common/app-error-messages";
import { logActivity } from "@/lib/activity-logs/server";

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
    redirect("/admin/media-review?error=stale-review");
  }

  revalidatePath("/admin/media-review");
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/media-review/${mediaItemId}`);
  revalidatePath("/author/media");
  await logActivity({
    action: item.publicationStatus === "published" ? "media-review.approved" : "media-review.rejected",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "media-item",
    entityId: item.id,
    entityLabel: item.title,
    message:
      item.publicationStatus === "published"
        ? "Заявка записи одобрена."
        : "Заявка записи отклонена.",
  });

  if (item.publicationStatus === "published") {
    revalidatePath("/");
    revalidatePath(`/media/${item.code}`);
    redirect("/admin/media-review?approved=1");
  }

  redirect("/admin/media-review?rejected=1");
}
