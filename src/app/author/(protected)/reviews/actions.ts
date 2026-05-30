"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  getAuthorReviewForEdit,
  getPublishedMediaItemForReview,
  upsertAuthorReview,
} from "@/db/queries/contribution-reviews";
import { requireAuthor } from "@/lib/author-auth";
import {
  getReviewFormErrorMessage,
  parseReviewFormInput,
} from "@/lib/contribution-review-form";

export type SaveAuthorReviewState = {
  error: string | null;
  values: {
    title: string;
    body: string;
  };
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getPositiveInteger(value: string) {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function getFormValues(formData: FormData) {
  return {
    title: getFormString(formData, "title"),
    body: getFormString(formData, "body"),
  };
}

export async function saveAuthorReviewAction(
  _state: SaveAuthorReviewState,
  formData: FormData,
): Promise<SaveAuthorReviewState> {
  const author = await requireAuthor();
  const contributionId = getPositiveInteger(getFormString(formData, "contributionId"));
  const mediaItemId = getPositiveInteger(getFormString(formData, "mediaItemId"));
  const intent = getFormString(formData, "intent");
  const status =
    intent === "draft"
      ? "draft"
      : author.canPublishMediaWithoutReview
        ? "published"
        : "submitted";
  const values = getFormValues(formData);
  const form = parseReviewFormInput({
    title: values.title,
    body: values.body,
  });

  if (!mediaItemId) {
    return {
      error: getReviewFormErrorMessage("invalid-media-item"),
      values,
    };
  }

  if (!form.ok) {
    return {
      error: getReviewFormErrorMessage(form.error),
      values,
    };
  }

  const mediaItem = await getPublishedMediaItemForReview(mediaItemId);

  if (!mediaItem) {
    return {
      error: getReviewFormErrorMessage("not-found"),
      values,
    };
  }

  if (contributionId) {
    const existingReview = await getAuthorReviewForEdit(author.id, contributionId);

    if (!existingReview) {
      notFound();
    }
  }

  const result = await upsertAuthorReview({
    contributionId,
    mediaItemId,
    authorId: author.id,
    status,
    ...form.value,
  });

  if (!result.ok) {
    return {
      error: getReviewFormErrorMessage(result.reason),
      values,
    };
  }

  revalidatePath(`/media/${mediaItem.code}`);
  revalidatePath("/author/reviews");
  revalidatePath("/admin/reviews");
  revalidatePath("/admin", "layout");

  redirect(
    `/author/reviews?${
      status === "draft" ? "saved" : status === "published" ? "published" : "submitted"
    }=1`,
  );
}
