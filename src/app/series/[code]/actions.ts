"use server";

import { revalidatePath } from "next/cache";

import {
  createAuthorMediaItemFranchiseLinks,
  getFranchiseByCode,
  requestAuthorMediaItemFranchiseRemoval,
} from "@/db/queries/franchises";
import { getMediaItemIdentityByCode } from "@/db/queries/media-items";
import { logActivity } from "@/lib/activity-logs/server";
import { requireAuthor } from "@/lib/auth/author-auth";
import { getFranchisePublicationStatusAfterAuthorSubmit } from "@/lib/authors/media-publication";

export type SeriesMediaLinkActionResult = {
  error: "duplicate" | "invalid" | "unavailable" | null;
  linkStatus: "published" | "submitted" | null;
  removalStatus?: "removed" | "requested" | null;
  success: boolean;
};

function revalidateSeriesMediaSurfaces(franchiseCode: string, mediaItemCode: string) {
  revalidatePath("/");
  revalidatePath("/series");
  revalidatePath(`/series/${franchiseCode}`);
  revalidatePath(`/media/${mediaItemCode}`);
  revalidatePath("/author/series");
  revalidatePath("/admin/franchise-review");
  revalidatePath("/admin", "layout");
}

export async function addAuthorSeriesMediaLinkAction(input: {
  franchiseCode: string;
  mediaItemCode: string;
}): Promise<SeriesMediaLinkActionResult> {
  const author = await requireAuthor();
  const [franchise, mediaItem] = await Promise.all([
    getFranchiseByCode(input.franchiseCode),
    getMediaItemIdentityByCode(input.mediaItemCode),
  ]);

  if (!franchise || !mediaItem) {
    return { error: "invalid", linkStatus: null, success: false };
  }

  const publicationStatus = getFranchisePublicationStatusAfterAuthorSubmit({
    canPublishFranchisesWithoutReview: author.canPublishFranchisesWithoutReview,
  });

  try {
    const links = await createAuthorMediaItemFranchiseLinks({
      authorId: author.id,
      franchiseIds: [franchise.id],
      mediaItemId: mediaItem.id,
      publicationStatus,
    });

    if (!links) {
      return { error: "duplicate", linkStatus: null, success: false };
    }
  } catch (error) {
    console.error(error);
    return { error: "unavailable", linkStatus: null, success: false };
  }

  revalidateSeriesMediaSurfaces(franchise.code, mediaItem.code);
  await logActivity({
    action:
      publicationStatus === "published"
        ? "franchise.media.attached"
        : "franchise.media.suggested",
    actorType: "author",
    authorId: author.id,
    entityType: "franchise",
    entityId: franchise.id,
    entityLabel: franchise.title,
    metadata: {
      mediaItem: { id: mediaItem.id, title: mediaItem.title },
      franchises: [{ id: franchise.id, title: franchise.title }],
    },
  });

  return { error: null, linkStatus: publicationStatus, success: true };
}

export async function removeAuthorSeriesMediaLinkAction(input: {
  franchiseCode: string;
  mediaItemCode: string;
}): Promise<SeriesMediaLinkActionResult> {
  const author = await requireAuthor();
  const [franchise, mediaItem] = await Promise.all([
    getFranchiseByCode(input.franchiseCode),
    getMediaItemIdentityByCode(input.mediaItemCode),
  ]);

  if (!franchise || !mediaItem) {
    return { error: "invalid", linkStatus: null, success: false };
  }

  let removalStatus: "removed" | "requested";
  try {
    const removedLink = await requestAuthorMediaItemFranchiseRemoval({
      authorId: author.id,
      canPublishFranchisesWithoutReview: author.canPublishFranchisesWithoutReview,
      franchiseId: franchise.id,
      mediaItemId: mediaItem.id,
    });

    if (!removedLink) {
      return { error: "invalid", linkStatus: null, success: false };
    }
    removalStatus = removedLink.status;
  } catch (error) {
    console.error(error);
    return { error: "unavailable", linkStatus: null, success: false };
  }

  revalidateSeriesMediaSurfaces(franchise.code, mediaItem.code);
  await logActivity({
    action: removalStatus === "requested"
      ? "franchise.media.removal-requested"
      : "franchise.media.detached",
    actorType: "author",
    authorId: author.id,
    entityType: "franchise",
    entityId: franchise.id,
    entityLabel: franchise.title,
    metadata: {
      mediaItem: { id: mediaItem.id, title: mediaItem.title },
      franchises: [{ id: franchise.id, title: franchise.title }],
    },
  });

  return { error: null, linkStatus: null, removalStatus, success: true };
}
