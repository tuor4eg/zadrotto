"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reviewContributionReview } from "@/db/queries/contribution-reviews";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAdminFormErrorCode } from "@/lib/common/app-error-messages";
import { logActivity } from "@/lib/activity-logs/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function reviewContributionReviewAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const contributionId = Number(getFormString(formData, "contributionId"));
  const decision = getFormString(formData, "decision");

  if (
    !Number.isInteger(contributionId) ||
    contributionId <= 0 ||
    (decision !== "published" && decision !== "rejected" && decision !== "hidden")
  ) {
    redirect("/admin/reviews?error=invalid-review");
  }

  let result;

  try {
    result = await reviewContributionReview({
      contributionId,
      adminUserId: adminUser.id,
      decision,
      adminNote: null,
    });
  } catch (error) {
    console.error(error);
    redirect(`/admin/reviews?error=${getAdminFormErrorCode(error)}`);
  }

  if (!result) {
    redirect("/admin/reviews?error=invalid-review");
  }

  revalidatePath("/admin/reviews");
  revalidatePath("/admin", "layout");
  revalidatePath("/author/reviews");
  revalidatePath(`/media/${result.mediaItemCode}`);
  await logActivity({
    action:
      decision === "published"
        ? "review.approved"
        : decision === "rejected"
          ? "review.rejected"
          : "review.hidden",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "review",
    entityId: result.id,
    entityLabel: result.mediaItemTitle,
    message:
      decision === "published"
        ? "Рецензия одобрена."
        : decision === "rejected"
          ? "Рецензия отклонена."
          : "Рецензия скрыта.",
    metadata: {
      mediaItemId: result.mediaItemId,
      mediaItemCode: result.mediaItemCode,
    },
  });

  redirect(`/admin/reviews?${decision}=1`);
}
