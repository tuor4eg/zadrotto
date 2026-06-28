"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { createAuthorPrivateMediaItemWithLimitCheck } from "@/db/operations/author-media-items";
import { getCoverSettings } from "@/db/queries/cover-settings";
import { createFranchise, franchiseIdsExist } from "@/db/queries/franchises";
import { getMediaCarrierSupportedMediaTypesById } from "@/db/queries/media-carriers";
import { mediaTypeExistsByCode } from "@/db/queries/media-types";
import {
  deleteAuthorDraftMediaItem,
  getAuthorPrivateMediaItemLimitUsage,
  getAuthorMediaItemForEdit,
  getAuthorMediaItemForView,
  submitAuthorMediaItemForPublication,
  updateAuthorMediaItem,
  withdrawAuthorMediaItemFromReview,
} from "@/db/queries/media-items";
import {
  buildAuthorMediaCode,
  isAuthorEditablePublicationStatus,
  normalizeOptionalFormString,
  parseOptionalPositiveInteger,
  parsePositiveIntegerList,
  parseOptionalReleaseYear,
} from "@/lib/forms/author-media";
import { requireAuthor } from "@/lib/auth/author-auth";
import { validateMediaCarrierForMediaType } from "@/lib/forms/media-carrier";
import {
  canAuthorCreateFranchise,
  canAuthorDeleteMediaItem,
  canAuthorWithdrawPublicationRequest,
  getPublicationStatusAfterAuthorSubmit,
} from "@/lib/authors/media-publication";
import { getAdminFormErrorCode, isUniqueViolation } from "@/lib/common/app-error-messages";
import { generateEntityCode } from "@/lib/common/generated-code";
import { logActivity } from "@/lib/activity-logs/server";
import {
  checkAuthorPrivateMediaLimit,
  getPrivateMediaLimitWindowStart,
} from "@/lib/authors/private-media-limits";
import {
  deleteUploadedCoverFilesIfNeeded,
  isS3ObjectKey,
  resolveCoverUpload,
} from "@/lib/covers/storage";
import type { CoverSourceInput } from "@/lib/covers/types";
import { isMediaTypeCode, type MediaType } from "@/lib/media/types";

export type CreateAuthorInlineFranchiseState = {
  error: string | null;
  franchise: {
    id: number;
    title: string;
    originalTitle: string | null;
  } | null;
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseMediaType(value: string): MediaType | null {
  return isMediaTypeCode(value) ? value : null;
}

function getOptionalCoverFile(formData: FormData) {
  const value = formData.get("coverFile");

  return value instanceof File && value.size > 0 ? value : null;
}

function getOptionalCoverCandidateToken(formData: FormData) {
  return normalizeOptionalFormString(getFormString(formData, "coverCandidateToken"));
}

function shouldRemoveCover(formData: FormData) {
  return getFormString(formData, "coverAction") === "remove";
}

function readFranchiseForm(formData: FormData) {
  const title = getFormString(formData, "title");

  if (!title) {
    return { ok: false as const, error: "required" };
  }

  return {
    ok: true as const,
    value: {
      title,
      originalTitle: normalizeOptionalFormString(getFormString(formData, "originalTitle")),
      description: normalizeOptionalFormString(getFormString(formData, "description")),
    },
  };
}

function readAuthorMediaForm(formData: FormData) {
  const title = getFormString(formData, "title");
  const mediaType = parseMediaType(getFormString(formData, "mediaType"));
  const releaseYear = parseOptionalReleaseYear(getFormString(formData, "releaseYear"));
  const franchiseIds = parsePositiveIntegerList(formData.getAll("franchiseIds"));
  const mediaCarrierId = parseOptionalPositiveInteger(getFormString(formData, "mediaCarrierId"));

  if (!title || !mediaType) {
    return { ok: false as const, error: "required" };
  }

  if (!releaseYear.ok) {
    return { ok: false as const, error: "invalid-year" };
  }

  if (!franchiseIds.ok) {
    return { ok: false as const, error: "invalid-franchise" };
  }

  if (!mediaCarrierId.ok) {
    return { ok: false as const, error: "invalid-carrier" };
  }

  return {
    ok: true as const,
    value: {
      title,
      originalTitle: normalizeOptionalFormString(getFormString(formData, "originalTitle")),
      description: normalizeOptionalFormString(getFormString(formData, "description")),
      mediaType,
      franchiseIds: franchiseIds.value,
      mediaCarrierId: mediaCarrierId.value,
      releaseYear: releaseYear.value,
    },
  };
}

async function areKnownFranchises(franchiseIds: number[]) {
  return franchiseIdsExist(franchiseIds);
}

async function isKnownMediaType(mediaType: MediaType) {
  return mediaTypeExistsByCode(mediaType);
}

async function validateMediaCarrier(input: {
  mediaCarrierId: number | null;
  mediaType: MediaType;
}) {
  const mediaCarrierMediaTypes = input.mediaCarrierId
    ? await getMediaCarrierSupportedMediaTypesById(input.mediaCarrierId)
    : null;

  return validateMediaCarrierForMediaType({
    mediaCarrierId: input.mediaCarrierId,
    mediaCarrierMediaTypes,
    mediaType: input.mediaType,
  });
}

async function canCreatePrivateMediaItem(author: {
  id: number;
  maxDraftMediaItems: number | null;
  maxDraftMediaItemsPerDay: number | null;
}) {
  if (author.maxDraftMediaItems === null && author.maxDraftMediaItemsPerDay === null) {
    return { ok: true as const };
  }

  const usage = await getAuthorPrivateMediaItemLimitUsage({
    authorId: author.id,
    since: getPrivateMediaLimitWindowStart(),
  });

  return checkAuthorPrivateMediaLimit({
    limits: {
      maxDraftMediaItems: author.maxDraftMediaItems,
      maxDraftMediaItemsPerDay: author.maxDraftMediaItemsPerDay,
    },
    usage,
  });
}

function getCoverSourceFromItem(item: {
  coverSourceProvider: string | null;
  coverSourceExternalId: string | null;
  coverSourcePageUrl: string | null;
}): CoverSourceInput {
  return {
    provider: item.coverSourceProvider as CoverSourceInput["provider"],
    externalId: item.coverSourceExternalId,
    pageUrl: item.coverSourcePageUrl,
  };
}

export async function createAuthorInlineFranchiseAction(
  _previousState: CreateAuthorInlineFranchiseState,
  formData: FormData,
): Promise<CreateAuthorInlineFranchiseState> {
  const author = await requireAuthor();

  if (!canAuthorCreateFranchise({
    canPublishMediaWithoutReview: author.canPublishMediaWithoutReview,
  })) {
    return { error: "forbidden", franchise: null };
  }

  const input = readFranchiseForm(formData);

  if (!input.ok) {
    return { error: input.error, franchise: null };
  }

  let franchise;

  try {
    franchise = await createFranchise({
      ...input.value,
      code: generateEntityCode({ type: "series", name: input.value.title }),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "duplicate-code", franchise: null };
    }

    console.error(error);
    return { error: getAdminFormErrorCode(error), franchise: null };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/franchises");
  revalidatePath("/admin/media");
  revalidatePath("/author/media/new");
  revalidatePath("/author/media", "layout");
  await logActivity({
    action: "franchise.created",
    actorType: "author",
    authorId: author.id,
    entityType: "franchise",
    entityId: franchise.id,
    entityLabel: franchise.title,
    message: "Серия создана автором.",
    metadata: { source: "author-inline-media-form" },
  });

  return {
    error: null,
    franchise: {
      id: franchise.id,
      title: input.value.title,
      originalTitle: input.value.originalTitle,
    },
  };
}

export async function createAuthorMediaItemAction(formData: FormData) {
  const author = await requireAuthor();
  const form = readAuthorMediaForm(formData);

  if (!form.ok) {
    redirect(`/author/media/new?error=${form.error}`);
  }

  if (!(await areKnownFranchises(form.value.franchiseIds))) {
    redirect("/author/media/new?error=invalid-franchise");
  }

  if (!(await isKnownMediaType(form.value.mediaType))) {
    redirect("/author/media/new?error=required");
  }

  const mediaCarrier = await validateMediaCarrier(form.value);

  if (!mediaCarrier.ok) {
    redirect(`/author/media/new?error=${mediaCarrier.error}`);
  }

  const limit = await canCreatePrivateMediaItem(author);

  if (!limit.ok) {
    redirect(`/author/media/new?error=${limit.reason}`);
  }

  const code = buildAuthorMediaCode({
    mediaType: form.value.mediaType,
    title: form.value.title,
    uniqueId: randomUUID().slice(0, 8),
  });
  const coverSettings = await getCoverSettings();
  const cover = await resolveCoverUpload({
    authorId: author.id,
    mediaItemCode: code,
    coverFile: getOptionalCoverFile(formData),
    candidateToken: getOptionalCoverCandidateToken(formData),
    maxBytes: coverSettings.coverMaxBytes,
  });

  if (!cover.ok) {
    redirect(`/author/media/new?error=${cover.error}`);
  }

  let result;

  try {
    result = await createAuthorPrivateMediaItemWithLimitCheck({
      authorId: author.id,
      code,
      coverUrl: cover.coverUrl,
      coverThumbUrl: cover.coverThumbUrl,
      coverSource: cover.source,
      limits: {
        maxDraftMediaItems: author.maxDraftMediaItems,
        maxDraftMediaItemsPerDay: author.maxDraftMediaItemsPerDay,
      },
      ...form.value,
    });
  } catch (error) {
    await deleteUploadedCoverFilesIfNeeded({
      coverUrl: cover.coverUrl,
      coverThumbUrl: cover.coverThumbUrl,
    }).catch(console.error);
    throw error;
  }

  if (!result.ok) {
    await deleteUploadedCoverFilesIfNeeded({
      coverUrl: cover.coverUrl,
      coverThumbUrl: cover.coverThumbUrl,
    }).catch(console.error);
    redirect(`/author/media/new?error=${result.reason}`);
  }

  revalidatePath("/author/media");
  redirect("/author/media?created=1");
}

export async function updateAuthorMediaItemAction(formData: FormData) {
  const author = await requireAuthor();
  const mediaItemId = Number(getFormString(formData, "mediaItemId"));
  const removeCover = shouldRemoveCover(formData);
  const form = readAuthorMediaForm(formData);

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  if (!form.ok) {
    redirect(`/author/media/${mediaItemId}/edit?error=${form.error}`);
  }

  if (!(await areKnownFranchises(form.value.franchiseIds))) {
    redirect(`/author/media/${mediaItemId}/edit?error=invalid-franchise`);
  }

  if (!(await isKnownMediaType(form.value.mediaType))) {
    redirect(`/author/media/${mediaItemId}/edit?error=required`);
  }

  const mediaCarrier = await validateMediaCarrier(form.value);

  if (!mediaCarrier.ok) {
    redirect(`/author/media/${mediaItemId}/edit?error=${mediaCarrier.error}`);
  }

  const item = await getAuthorMediaItemForEdit(author.id, mediaItemId);

  if (!item) {
    notFound();
  }

  if (!isAuthorEditablePublicationStatus(item.publicationStatus)) {
    redirect("/author/media?error=locked");
  }

  const coverSettings = await getCoverSettings();
  const cover = await resolveCoverUpload({
    authorId: author.id,
    mediaItemCode: `media-${mediaItemId}`,
    coverFile: removeCover ? null : getOptionalCoverFile(formData),
    candidateToken: removeCover ? null : getOptionalCoverCandidateToken(formData),
    maxBytes: coverSettings.coverMaxBytes,
  });

  if (!cover.ok) {
    redirect(`/author/media/${mediaItemId}/edit?error=${cover.error}`);
  }

  const nextCoverUrl = removeCover ? null : (cover.coverUrl ?? item.coverUrl);
  const nextCoverThumbUrl = removeCover ? null : (cover.coverThumbUrl ?? item.coverThumbUrl);
  const nextCoverSource =
    removeCover || cover.coverUrl ? cover.source : getCoverSourceFromItem(item);

  if ((removeCover || cover.coverUrl) && isS3ObjectKey(item.coverUrl)) {
    try {
      await deleteUploadedCoverFilesIfNeeded({
        coverUrl: item.coverUrl,
        coverThumbUrl: item.coverThumbUrl,
      });
    } catch {
      redirect(`/author/media/${mediaItemId}/edit?error=cover-delete`);
    }
  }

  await updateAuthorMediaItem({
    authorId: author.id,
    mediaItemId,
    coverUrl: nextCoverUrl,
    coverThumbUrl: nextCoverThumbUrl,
    coverSource: nextCoverSource,
    ...form.value,
  });

  revalidatePath("/author/media");
  redirect("/author/media?updated=1");
}

export async function publishAuthorMediaItemAction(formData: FormData) {
  const author = await requireAuthor();
  const mediaItemId = Number(getFormString(formData, "mediaItemId"));

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const item = await getAuthorMediaItemForView(author.id, mediaItemId);

  if (!item) {
    notFound();
  }

  if (item.publicationStatus !== "private" && item.publicationStatus !== "rejected") {
    redirect("/author/media?error=publish-locked");
  }

  const nextStatus = getPublicationStatusAfterAuthorSubmit({
    canPublishMediaWithoutReview: author.canPublishMediaWithoutReview,
  });
  const updatedItem = await submitAuthorMediaItemForPublication({
    authorId: author.id,
    mediaItemId,
    nextStatus,
  });

  if (!updatedItem) {
    redirect("/author/media?error=publish-locked");
  }

  revalidatePath("/author/media");
  revalidatePath(`/author/media/${mediaItemId}`);

  if (updatedItem.publicationStatus === "published") {
    revalidatePath("/");
    revalidatePath(`/media/${updatedItem.code}`);
    redirect("/author/media?published=1");
  }

  revalidatePath("/admin/media-review");
  revalidatePath("/admin", "layout");
  redirect("/author/media?submitted=1");
}

export async function withdrawAuthorMediaItemAction(formData: FormData) {
  const author = await requireAuthor();
  const mediaItemId = Number(getFormString(formData, "mediaItemId"));

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const item = await getAuthorMediaItemForEdit(author.id, mediaItemId);

  if (!item) {
    notFound();
  }

  if (!canAuthorWithdrawPublicationRequest(item.publicationStatus)) {
    redirect("/author/media?error=withdraw-locked");
  }

  const updatedItem = await withdrawAuthorMediaItemFromReview({
    authorId: author.id,
    mediaItemId,
  });

  if (!updatedItem) {
    redirect("/author/media?error=withdraw-locked");
  }

  revalidatePath("/author/media");
  revalidatePath(`/author/media/${mediaItemId}`);
  revalidatePath("/admin/media-review");
  revalidatePath("/admin", "layout");
  redirect("/author/media?withdrawn=1");
}

export async function deleteAuthorMediaItemAction(formData: FormData) {
  const author = await requireAuthor();
  const mediaItemId = Number(getFormString(formData, "mediaItemId"));

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const item = await getAuthorMediaItemForEdit(author.id, mediaItemId);

  if (!item) {
    notFound();
  }

  if (!canAuthorDeleteMediaItem(item.publicationStatus)) {
    redirect("/author/media?error=delete-locked");
  }

  const deletedItem = await deleteAuthorDraftMediaItem({
    authorId: author.id,
    mediaItemId,
  });

  if (!deletedItem) {
    redirect("/author/media?error=delete-locked");
  }

  await deleteUploadedCoverFilesIfNeeded({
    coverUrl: deletedItem.coverUrl,
    coverThumbUrl: deletedItem.coverThumbUrl,
  }).catch(console.error);

  revalidatePath("/author/media");
  revalidatePath(`/author/media/${mediaItemId}`);
  redirect("/author/media?deleted=1");
}
