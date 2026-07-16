"use server";

import { revalidatePath } from "next/cache";

import {
  createAuthorFranchiseWithMediaItemLink,
  createAuthorMediaItemFranchiseLinks,
} from "@/db/queries/franchises";
import { getMediaItemIdentityByCode } from "@/db/queries/media-items";
import { requireAuthor } from "@/lib/auth/author-auth";
import { logActivity } from "@/lib/activity-logs/server";
import { generateEntityCode } from "@/lib/common/generated-code";
import { isUniqueViolation } from "@/lib/common/app-error-messages";
import { getFranchisePublicationStatusAfterAuthorSubmit } from "@/lib/authors/media-publication";
import { normalizeOptionalFranchiseString } from "@/lib/forms/admin-franchise";

export type MediaItemFranchiseSuggestionState = {
  error: "duplicate" | "invalid" | "unavailable" | null;
  success: boolean;
};

const initialErrorState = { error: "invalid" as const, success: false };

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function submitAuthorMediaItemFranchiseSuggestionAction(
  _previousState: MediaItemFranchiseSuggestionState,
  formData: FormData,
): Promise<MediaItemFranchiseSuggestionState> {
  const author = await requireAuthor();
  const mediaItemId = Number(getFormString(formData, "mediaItemId"));
  const mediaItemCode = getFormString(formData, "mediaItemCode");
  const mode = getFormString(formData, "mode");
  const publicationStatus = getFranchisePublicationStatusAfterAuthorSubmit({
    canPublishFranchisesWithoutReview: author.canPublishFranchisesWithoutReview,
  });

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0 || !mediaItemCode) {
    return initialErrorState;
  }

  const mediaItem = await getMediaItemIdentityByCode(mediaItemCode);

  if (!mediaItem || mediaItem.id !== mediaItemId) {
    return initialErrorState;
  }

  let affectedFranchises: Array<{ id: number; title: string }> = [];

  try {
    if (mode === "existing") {
      const franchiseIds = [...new Set(
        formData
          .getAll("franchiseIds")
          .filter((value): value is string => typeof value === "string")
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      )];

      if (franchiseIds.length === 0) {
        return initialErrorState;
      }

      const links = await createAuthorMediaItemFranchiseLinks({
        authorId: author.id,
        franchiseIds,
        mediaItemId,
        publicationStatus,
      });

      if (!links) {
        return { error: "duplicate", success: false };
      }

      affectedFranchises = links;
    } else if (mode === "new") {
      const title = getFormString(formData, "title");

      if (!title) {
        return initialErrorState;
      }

      const franchise = await createAuthorFranchiseWithMediaItemLink({
        authorId: author.id,
        code: generateEntityCode({ type: "series", name: title }),
        description: normalizeOptionalFranchiseString(getFormString(formData, "description")),
        mediaItemId,
        originalTitle: normalizeOptionalFranchiseString(getFormString(formData, "originalTitle")),
        publicationStatus,
        title,
      });

      if (!franchise) {
        return { error: "unavailable", success: false };
      }

      affectedFranchises = [{ id: franchise.id, title: franchise.title }];
    } else {
      return initialErrorState;
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "duplicate", success: false };
    }

    console.error(error);
    return { error: "unavailable", success: false };
  }

  revalidatePath(`/media/${mediaItemCode}`);
  revalidatePath("/");
  revalidatePath("/admin/franchise-review");
  revalidatePath("/admin", "layout");
  await logActivity({
    action:
      publicationStatus === "published"
        ? "franchise.media.attached"
        : "franchise.media.suggested",
    actorType: "author",
    authorId: author.id,
    entityType: "media-item",
    entityId: mediaItemId,
    entityLabel: mediaItem.title,
    metadata: {
      mediaItem: { id: mediaItem.id, title: mediaItem.title },
      franchises: affectedFranchises,
    },
  });

  return { error: null, success: true };
}
