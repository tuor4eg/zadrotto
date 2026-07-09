"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteHiddenContributionReview,
  reviewContributionReview,
} from "@/db/queries/contribution-reviews";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAdminFormErrorCode } from "@/lib/common/app-error-messages";
import { logActivity } from "@/lib/activity-logs/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

const REVIEW_REDIRECT_PATHS = new Set(["/admin/materials/reviews", "/admin/reviews"]);
const REVIEW_TOAST_PARAMS = ["deleted", "error", "hidden", "published", "rejected"];

function getSafeReviewRedirectPath(formData: FormData, fallbackPath: string) {
  const redirectTo = getFormString(formData, "redirectTo");

  if (!redirectTo) {
    return fallbackPath;
  }

  try {
    const url = new URL(redirectTo, "http://admin.local");

    if (url.origin !== "http://admin.local" || !REVIEW_REDIRECT_PATHS.has(url.pathname)) {
      return fallbackPath;
    }

    for (const param of REVIEW_TOAST_PARAMS) {
      url.searchParams.delete(param);
    }

    const query = url.searchParams.toString();

    return query ? `${url.pathname}?${query}` : url.pathname;
  } catch {
    return fallbackPath;
  }
}

function withReviewToastParam(path: string, key: string, value = "1") {
  const url = new URL(path, "http://admin.local");

  url.searchParams.set(key, value);

  const query = url.searchParams.toString();

  return query ? `${url.pathname}?${query}` : url.pathname;
}

export async function reviewContributionReviewAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const contributionId = Number(getFormString(formData, "contributionId"));
  const decision = getFormString(formData, "decision");
  const fallbackRedirectPath =
    getFormString(formData, "redirectScope") === "materials"
      ? "/admin/materials/reviews"
      : "/admin/reviews";
  const redirectPath = getSafeReviewRedirectPath(formData, fallbackRedirectPath);

  if (
    !Number.isInteger(contributionId) ||
    contributionId <= 0 ||
    (decision !== "published" && decision !== "rejected" && decision !== "hidden")
  ) {
    redirect(withReviewToastParam(redirectPath, "error", "invalid-review"));
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
    redirect(withReviewToastParam(redirectPath, "error", getAdminFormErrorCode(error)));
  }

  if (!result) {
    redirect(withReviewToastParam(redirectPath, "error", "invalid-review"));
  }

  revalidatePath("/admin/reviews");
  revalidatePath("/admin/materials/reviews");
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

  redirect(withReviewToastParam(redirectPath, decision));
}

export async function deleteContributionReviewAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const contributionId = Number(getFormString(formData, "contributionId"));
  const redirectPath = getSafeReviewRedirectPath(formData, "/admin/materials/reviews");

  if (!Number.isInteger(contributionId) || contributionId <= 0) {
    redirect(withReviewToastParam(redirectPath, "error", "invalid-review"));
  }

  let result;

  try {
    result = await deleteHiddenContributionReview(contributionId);
  } catch (error) {
    console.error(error);
    redirect(withReviewToastParam(redirectPath, "error", getAdminFormErrorCode(error)));
  }

  if (!result) {
    redirect(withReviewToastParam(redirectPath, "error", "delete-hidden-only"));
  }

  revalidatePath("/admin/materials/reviews");
  revalidatePath("/admin/reviews");
  revalidatePath("/admin", "layout");
  revalidatePath("/author/reviews");
  revalidatePath(`/media/${result.mediaItemCode}`);
  await logActivity({
    action: "review.deleted",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "review",
    entityId: result.id,
    entityLabel: result.mediaItemTitle,
    message: "Скрытая рецензия удалена.",
    metadata: {
      mediaItemId: result.mediaItemId,
      mediaItemCode: result.mediaItemCode,
    },
  });

  redirect(withReviewToastParam(redirectPath, "deleted"));
}
