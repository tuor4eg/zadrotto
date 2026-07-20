"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reviewAuthorRegistration } from "@/db/operations/author-auth";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { logActivity } from "@/lib/activity-logs/server";

export async function reviewAuthorRegistrationAction(formData: FormData) {
  const admin = await requireAdminUser();
  const authorId = Number(formData.get("authorId"));
  const accessProfileId = Number(formData.get("accessProfileId"));
  const decision = formData.get("decision") === "reject" ? "reject" : "approve";
  if (!Number.isInteger(authorId) || authorId <= 0) redirect("/admin/registration-review?error=invalid");
  const reviewed = await reviewAuthorRegistration({
    authorId,
    adminUserId: admin.id,
    decision,
    accessProfileId: Number.isInteger(accessProfileId) && accessProfileId > 0 ? accessProfileId : undefined,
  });
  if (!reviewed) redirect("/admin/registration-review?error=stale");
  await logActivity({
    action: decision === "approve" ? "author.registration.approved" : "author.registration.rejected",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "author-account",
    entityId: authorId,
    message: decision === "approve" ? "Регистрация автора одобрена." : "Регистрация автора отклонена.",
    metadata: decision === "approve" ? { accessProfileId } : null,
  });
  revalidatePath("/admin/registration-review");
  redirect(`/admin/registration-review?reviewed=${decision}`);
}
