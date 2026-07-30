"use server";

import { revalidatePath } from "next/cache";

import {
  createAuthorFranchiseWithMediaItemLink,
  createAuthorMediaItemFranchiseLinks,
  findPublishedFranchiseDuplicateCandidates,
  getFranchiseByCode,
  getPublishedFranchiseOptionById,
  requestAuthorMediaItemFranchiseRemoval,
} from "@/db/queries/franchises";
import { getMediaItemIdentityByCode } from "@/db/queries/media-items";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { requireAuthor } from "@/lib/auth/author-auth";
import { logActivity } from "@/lib/activity-logs/server";
import { generateEntityCode } from "@/lib/common/generated-code";
import { isUniqueViolation } from "@/lib/common/app-error-messages";
import { getFranchisePublicationStatusAfterAuthorSubmit } from "@/lib/authors/media-publication";
import { normalizeOptionalFranchiseString } from "@/lib/forms/admin-franchise";
import {
  isExactFranchiseDuplicate,
  verifyFranchiseDuplicateAcknowledgementToken,
} from "@/lib/franchises/franchise-duplicates";

export type MediaItemFranchiseSuggestionState = {
  error:
    | "duplicate"
    | "duplicate-franchise-exact"
    | "duplicate-franchise-possible"
    | "invalid"
    | "unavailable"
    | null;
  success: boolean;
};

const initialErrorState = { error: "invalid" as const, success: false };

export type MediaItemFranchiseRemovalState = {
  error: "invalid" | "unavailable" | null;
  status: "removed" | "requested" | null;
};

export async function removeAuthorMediaItemFranchiseAction(input: {
  franchiseCode: string;
  mediaItemCode: string;
}): Promise<MediaItemFranchiseRemovalState> {
  const author = await requireAuthor();
  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id);
  const [franchise, mediaItem] = await Promise.all([
    getFranchiseByCode(input.franchiseCode),
    getMediaItemIdentityByCode(input.mediaItemCode, accessibleMediaTypeCodes),
  ]);
  if (!franchise || !mediaItem) return { error: "invalid", status: null };
  try {
    const result = await requestAuthorMediaItemFranchiseRemoval({
      authorId: author.id,
      canPublishFranchisesWithoutReview: author.canPublishFranchisesWithoutReview,
      franchiseId: franchise.id,
      mediaItemId: mediaItem.id,
    });
    if (!result) return { error: "invalid", status: null };
    revalidatePath(`/media/${mediaItem.code}`);
    revalidatePath(`/series/${franchise.code}`);
    revalidatePath("/admin/franchise-review");
    revalidatePath("/", "layout");
    await logActivity({
      action: result.status === "removed" ? "franchise.media.detached" : "franchise.media.removal-requested",
      actorType: "author", authorId: author.id, entityType: "media-item", entityId: mediaItem.id,
      entityLabel: mediaItem.title, metadata: { franchises: [{ id: franchise.id, title: franchise.title }] },
    });
    return { error: null, status: result.status };
  } catch (error) {
    console.error(error);
    return { error: "unavailable", status: null };
  }
}

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

  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id);
  const mediaItem = await getMediaItemIdentityByCode(mediaItemCode, accessibleMediaTypeCodes);

  if (!mediaItem || mediaItem.id !== mediaItemId) {
    return initialErrorState;
  }

  let affectedFranchises: Array<{ id: number; title: string }> = [];
  const removalIds = [...new Set(
    formData.getAll("franchiseRemovalIds")
      .filter((value): value is string => typeof value === "string")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  )];
  const franchiseIds = mode === "existing" ? [...new Set(
    formData
      .getAll("franchiseIds")
      .filter((value): value is string => typeof value === "string")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  )] : [];
  const newFranchiseTitle = mode === "new" ? getFormString(formData, "title") : "";
  const newFranchiseParentIdValue = mode === "new" ? getFormString(formData, "parentId") : "";
  const newFranchiseParentId = newFranchiseParentIdValue ? Number(newFranchiseParentIdValue) : null;

  if (
    (mode !== "existing" && mode !== "new") ||
    (mode === "existing" && franchiseIds.length === 0 && removalIds.length === 0) ||
    (mode === "new" && (
      !newFranchiseTitle ||
      (newFranchiseParentId !== null &&
        (!Number.isSafeInteger(newFranchiseParentId) || newFranchiseParentId <= 0))
    ))
  ) {
    return initialErrorState;
  }

  const removalStatuses: Array<{
    franchise: { id: number; title: string };
    status: "removed" | "requested";
  }> = [];

  try {
    for (const franchiseId of removalIds) {
      const result = await requestAuthorMediaItemFranchiseRemoval({
        authorId: author.id,
        canPublishFranchisesWithoutReview: author.canPublishFranchisesWithoutReview,
        franchiseId,
        mediaItemId,
      });
      if (!result) return initialErrorState;
      removalStatuses.push({
        franchise: result.franchise,
        status: result.status,
      });
    }
    if (mode === "existing") {
      if (franchiseIds.length > 0) {
        const links = await createAuthorMediaItemFranchiseLinks({
          authorId: author.id,
          franchiseIds,
          mediaItemId,
          publicationStatus,
        });
        if (!links) return { error: "duplicate", success: false };
        affectedFranchises = links;
      }
    } else if (mode === "new") {
      const title = newFranchiseTitle;
      const parent = newFranchiseParentId
        ? await getPublishedFranchiseOptionById(newFranchiseParentId)
        : null;

      if (newFranchiseParentId && !parent) {
        return initialErrorState;
      }

      const franchiseInput = {
        title,
        originalTitle: normalizeOptionalFranchiseString(getFormString(formData, "originalTitle")),
      };
      const matches = await findPublishedFranchiseDuplicateCandidates(franchiseInput);
      const exactMatches = matches.filter((match) => isExactFranchiseDuplicate(franchiseInput, match));

      if (exactMatches.length > 0) {
        return { error: "duplicate-franchise-exact", success: false };
      }

      const possibleMatches = matches.filter((match) => !exactMatches.includes(match));
      if (
        possibleMatches.length > 0 &&
        (getFormString(formData, "franchiseDuplicateAcknowledged") !== "1" ||
          !verifyFranchiseDuplicateAcknowledgementToken(
            getFormString(formData, "franchiseDuplicateCheckToken"),
            { form: franchiseInput, matches: possibleMatches },
          ))
      ) {
        return { error: "duplicate-franchise-possible", success: false };
      }

      const franchise = await createAuthorFranchiseWithMediaItemLink({
        authorId: author.id,
        code: generateEntityCode({ type: "series", name: title }),
        description: normalizeOptionalFranchiseString(getFormString(formData, "description")),
        mediaItemId,
        originalTitle: franchiseInput.originalTitle,
        parentId: parent?.id ?? null,
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
  if (affectedFranchises.length > 0) {
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
  }
  for (const removal of removalStatuses) {
    await logActivity({
      action: removal.status === "removed" ? "franchise.media.detached" : "franchise.media.removal-requested",
      actorType: "author", authorId: author.id, entityType: "media-item", entityId: mediaItemId,
      entityLabel: mediaItem.title,
      metadata: {
        mediaItem: { id: mediaItem.id, title: mediaItem.title },
        franchises: [removal.franchise],
      },
    });
  }

  return { error: null, success: true };
}
