"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reviewSubmittedFranchise, reviewSubmittedMediaItemFranchise } from "@/db/queries/franchises";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { logActivity } from "@/lib/activity-logs/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function reviewFranchiseAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const franchiseId = Number(getFormString(formData, "franchiseId"));
  const mediaItemIdValue = getFormString(formData, "mediaItemId");
  const mediaItemId = mediaItemIdValue ? Number(mediaItemIdValue) : null;
  const decision = getFormString(formData, "decision");

  if (!Number.isInteger(franchiseId) || franchiseId <= 0 || (decision !== "published" && decision !== "rejected")) {
    redirect("/admin/franchise-review?error=invalid-review");
  }

  const result = mediaItemId === null
    ? await reviewSubmittedFranchise({ adminUserId: adminUser.id, decision, franchiseId })
    : Number.isInteger(mediaItemId) && mediaItemId > 0
      ? await reviewSubmittedMediaItemFranchise({ adminUserId: adminUser.id, decision, franchiseId, mediaItemId })
      : null;

  if (!result) {
    redirect("/admin/franchise-review?error=stale-review");
  }

  revalidatePath("/admin/franchise-review");
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/franchises");
  revalidatePath("/author/media");
  revalidatePath("/");
  await logActivity({
    action: decision === "published" ? "franchise-review.approved" : "franchise-review.rejected",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: mediaItemId === null ? "franchise" : "media-item",
    entityId: mediaItemId ?? franchiseId,
    entityLabel: mediaItemId === null ? "Серия" : "Привязка серии",
    message: decision === "published" ? "Заявка серии одобрена." : "Заявка серии отклонена.",
  });

  redirect(`/admin/franchise-review?${decision === "published" ? "approved" : "rejected"}=1`);
}
