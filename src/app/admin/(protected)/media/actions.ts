"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorExistsById } from "@/db/queries/authors";
import { getCoverSettings } from "@/db/queries/cover-settings";
import { franchiseIdsExist } from "@/db/queries/franchises";
import { getMediaCarrierSupportedMediaTypesById } from "@/db/queries/media-carriers";
import { mediaTypeExistsByCode } from "@/db/queries/media-types";
import {
  createAdminMediaItem,
  deleteAdminMediaItemIfUnrated,
  getAdminMediaItemIdentityById,
  updateAdminMediaItem,
  updateAdminMediaItemPublicationStatus,
} from "@/db/queries/media-items";
import {
  normalizeOptionalFormString,
  parseOptionalPositiveInteger,
  parsePositiveIntegerList,
  parseOptionalReleaseYear,
} from "@/lib/forms/author-media";
import { validateMediaCarrierForMediaType } from "@/lib/forms/media-carrier";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAdminFormErrorCode } from "@/lib/common/app-error-messages";
import {
  deleteUploadedCoverFilesIfNeeded,
  isS3ObjectKey,
  resolveCoverUpload,
} from "@/lib/covers/storage";
import type { CoverSourceInput } from "@/lib/covers/types";
import { generateEntityCode } from "@/lib/common/generated-code";
import { logActivity } from "@/lib/activity-logs/server";
import { isMediaTypeCode, type MediaType } from "@/lib/media/types";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseMediaType(value: string): MediaType | null {
  return isMediaTypeCode(value) ? value : null;
}

function parseRequiredMediaItemId(value: string) {
  const parsedValue = parseOptionalPositiveInteger(value);

  return parsedValue.ok && parsedValue.value !== null
    ? { ok: true as const, value: parsedValue.value }
    : { ok: false as const };
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

function readMediaForm(formData: FormData, options?: { requireAuthor?: boolean }) {
  const title = getFormString(formData, "title");
  const mediaType = parseMediaType(getFormString(formData, "mediaType"));
  const releaseYear = parseOptionalReleaseYear(getFormString(formData, "releaseYear"));
  const franchiseIds = parsePositiveIntegerList(formData.getAll("franchiseIds"));
  const mediaCarrierId = parseOptionalPositiveInteger(getFormString(formData, "mediaCarrierId"));
  const authorId = parseOptionalPositiveInteger(getFormString(formData, "authorId"));

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

  if (!authorId.ok) {
    return { ok: false as const, error: "invalid-author" };
  }

  if (options?.requireAuthor && authorId.value === null) {
    return { ok: false as const, error: "author-required" };
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
      authorId: authorId.value,
      releaseYear: releaseYear.value,
    },
  };
}

async function areKnownFranchises(franchiseIds: number[]) {
  return franchiseIdsExist(franchiseIds);
}

async function isKnownAuthor(authorId: number | null) {
  return authorId === null || authorExistsById(authorId);
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

function revalidateMediaSurfaces(input: {
  id: number;
  code: string;
  franchises: { id: number; code: string }[];
}) {
  revalidatePath("/admin/media");
  revalidatePath(`/admin/media/${input.id}/edit`);
  revalidatePath("/admin/franchises");
  revalidatePath("/admin/media-review");
  revalidatePath(`/admin/media-review/${input.id}`);
  revalidatePath("/author/media");
  revalidatePath(`/author/media/${input.id}`);
  revalidatePath(`/author/media/${input.id}/edit`);
  revalidatePath("/");
  revalidatePath(`/media/${input.code}`);

  for (const franchise of input.franchises) {
    revalidatePath(`/franchises/${franchise.code}`);
    revalidatePath(`/admin/franchises/${franchise.id}/edit`);
  }
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

export async function updateAdminMediaItemAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const mediaItemId = parseRequiredMediaItemId(getFormString(formData, "mediaItemId"));
  const removeCover = shouldRemoveCover(formData);
  const form = readMediaForm(formData, { requireAuthor: true });

  if (!mediaItemId.ok) {
    redirect("/admin/media?error=invalid-media");
  }

  if (!form.ok) {
    redirect(`/admin/media/${mediaItemId.value}/edit?error=${form.error}`);
  }

  if (!(await areKnownFranchises(form.value.franchiseIds))) {
    redirect(`/admin/media/${mediaItemId.value}/edit?error=invalid-franchise`);
  }

  if (!(await isKnownMediaType(form.value.mediaType))) {
    redirect(`/admin/media/${mediaItemId.value}/edit?error=required`);
  }

  const mediaCarrier = await validateMediaCarrier(form.value);

  if (!mediaCarrier.ok) {
    redirect(`/admin/media/${mediaItemId.value}/edit?error=${mediaCarrier.error}`);
  }

  if (!(await isKnownAuthor(form.value.authorId))) {
    redirect(`/admin/media/${mediaItemId.value}/edit?error=invalid-author`);
  }

  const existingItem = await getAdminMediaItemIdentityById(mediaItemId.value);

  if (!existingItem) {
    redirect("/admin/media?error=invalid-media");
  }

  const coverSettings = await getCoverSettings();
  const cover = await resolveCoverUpload({
    mediaItemCode: existingItem.code,
    coverFile: removeCover ? null : getOptionalCoverFile(formData),
    candidateToken: removeCover ? null : getOptionalCoverCandidateToken(formData),
    maxBytes: coverSettings.coverMaxBytes,
  });

  if (!cover.ok) {
    redirect(`/admin/media/${mediaItemId.value}/edit?error=${cover.error}`);
  }

  const nextCoverUrl = removeCover ? null : (cover.coverUrl ?? existingItem.coverUrl);
  const nextCoverThumbUrl = removeCover
    ? null
    : (cover.coverThumbUrl ?? existingItem.coverThumbUrl);
  const nextCoverSource =
    removeCover || cover.coverUrl ? cover.source : getCoverSourceFromItem(existingItem);

  if ((removeCover || cover.coverUrl) && isS3ObjectKey(existingItem.coverUrl)) {
    try {
      await deleteUploadedCoverFilesIfNeeded({
        coverUrl: existingItem.coverUrl,
        coverThumbUrl: existingItem.coverThumbUrl,
      });
    } catch {
      redirect(`/admin/media/${mediaItemId.value}/edit?error=cover-delete`);
    }
  }

  try {
    const updatedItem = await updateAdminMediaItem({
      mediaItemId: mediaItemId.value,
      coverUrl: nextCoverUrl,
      coverThumbUrl: nextCoverThumbUrl,
      coverSource: nextCoverSource,
      ...form.value,
    });

    if (!updatedItem) {
      redirect("/admin/media?error=invalid-media");
    }
  } catch (error) {
    console.error(error);
    redirect(`/admin/media/${mediaItemId.value}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  const nextIdentity = await getAdminMediaItemIdentityById(mediaItemId.value);

  if (nextIdentity) {
    revalidateMediaSurfaces(nextIdentity);
    await logActivity({
      action: "media.updated",
      actorType: "admin",
      adminUserId: adminUser.id,
      entityType: "media-item",
      entityId: mediaItemId.value,
      entityLabel: form.value.title,
      message: "Запись изменена.",
      metadata: {
        mediaType: form.value.mediaType,
        franchiseIds: form.value.franchiseIds,
        mediaCarrierId: form.value.mediaCarrierId,
        authorId: form.value.authorId,
      },
    });

    for (const franchise of existingItem.franchises) {
      if (!nextIdentity.franchises.some((nextFranchise) => nextFranchise.id === franchise.id)) {
        revalidatePath(`/admin/franchises/${franchise.id}/edit`);
        revalidatePath(`/franchises/${franchise.code}`);
      }
    }
  }

  redirect(`/admin/media/${mediaItemId.value}/edit?updated=1`);
}

export async function createAdminMediaItemAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const form = readMediaForm(formData, { requireAuthor: true });

  if (!form.ok) {
    redirect(`/admin/media/new?error=${form.error}`);
  }

  if (form.value.authorId === null) {
    redirect("/admin/media/new?error=author-required");
  }

  if (!(await areKnownFranchises(form.value.franchiseIds))) {
    redirect("/admin/media/new?error=invalid-franchise");
  }

  if (!(await isKnownMediaType(form.value.mediaType))) {
    redirect("/admin/media/new?error=required");
  }

  const mediaCarrier = await validateMediaCarrier(form.value);

  if (!mediaCarrier.ok) {
    redirect(`/admin/media/new?error=${mediaCarrier.error}`);
  }

  if (!(await isKnownAuthor(form.value.authorId))) {
    redirect("/admin/media/new?error=invalid-author");
  }

  const code = generateEntityCode({
    type: form.value.mediaType,
    name: form.value.title,
    uniqueId: randomUUID().slice(0, 8),
  });
  const coverSettings = await getCoverSettings();
  const cover = await resolveCoverUpload({
    mediaItemCode: code,
    coverFile: getOptionalCoverFile(formData),
    candidateToken: getOptionalCoverCandidateToken(formData),
    maxBytes: coverSettings.coverMaxBytes,
  });

  if (!cover.ok) {
    redirect(`/admin/media/new?error=${cover.error}`);
  }

  let item;

  try {
    const { authorId, ...mediaInput } = form.value;

    item = await createAdminMediaItem({
      authorId,
      code,
      coverUrl: cover.coverUrl,
      coverThumbUrl: cover.coverThumbUrl,
      coverSource: cover.source,
      ...mediaInput,
    });
  } catch (error) {
    await deleteUploadedCoverFilesIfNeeded({
      coverUrl: cover.coverUrl,
      coverThumbUrl: cover.coverThumbUrl,
    }).catch(console.error);
    console.error(error);
    redirect(`/admin/media/new?error=${getAdminFormErrorCode(error)}`);
  }

  const identity = await getAdminMediaItemIdentityById(item.id);

  if (identity) {
    revalidateMediaSurfaces(identity);
  }

  await logActivity({
    action: "media.created",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "media-item",
    entityId: item.id,
    entityLabel: form.value.title,
    message: "Запись создана.",
    metadata: {
      mediaType: form.value.mediaType,
      franchiseIds: form.value.franchiseIds,
      mediaCarrierId: form.value.mediaCarrierId,
      authorId: form.value.authorId,
    },
  });

  redirect(`/admin/media/${item.id}/edit?created=1`);
}

export async function deleteAdminMediaItemAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const mediaItemId = parseRequiredMediaItemId(getFormString(formData, "mediaItemId"));

  if (!mediaItemId.ok) {
    redirect("/admin/media?error=invalid-media");
  }

  const existingItem = await getAdminMediaItemIdentityById(mediaItemId.value);

  if (!existingItem) {
    redirect("/admin/media?error=invalid-media");
  }

  let deletedItem;

  try {
    deletedItem = await deleteAdminMediaItemIfUnrated(mediaItemId.value);
  } catch (error) {
    console.error(error);
    redirect(`/admin/media?error=${getAdminFormErrorCode(error)}`);
  }

  if (!deletedItem) {
    redirect("/admin/media?error=rated");
  }

  if (isS3ObjectKey(existingItem.coverUrl)) {
    try {
      await deleteUploadedCoverFilesIfNeeded({
        coverUrl: existingItem.coverUrl,
        coverThumbUrl: existingItem.coverThumbUrl,
      });
    } catch (error) {
      console.error(error);
    }
  }

  revalidateMediaSurfaces(existingItem);
  await logActivity({
    action: "media.deleted",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "media-item",
    entityId: existingItem.id,
    entityLabel: existingItem.title,
    message: "Запись удалена.",
  });
  redirect("/admin/media?deleted=1");
}

export async function updateAdminMediaItemPublicationStatusAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const mediaItemId = parseRequiredMediaItemId(getFormString(formData, "mediaItemId"));
  const nextStatus = getFormString(formData, "nextStatus");

  if (!mediaItemId.ok || (nextStatus !== "private" && nextStatus !== "published")) {
    redirect("/admin/media?error=invalid-media");
  }

  let item;

  try {
    item = await updateAdminMediaItemPublicationStatus({
      mediaItemId: mediaItemId.value,
      nextStatus,
    });
  } catch (error) {
    console.error(error);
    redirect(`/admin/media/${mediaItemId.value}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  if (!item) {
    redirect("/admin/media?error=invalid-media");
  }

  revalidateMediaSurfaces(item);
  await logActivity({
    action: nextStatus === "published" ? "media.published" : "media.unpublished",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "media-item",
    entityId: item.id,
    entityLabel: item.title,
    message: nextStatus === "published" ? "Запись опубликована." : "Запись снята с публикации.",
  });
  redirect(
    `/admin/media/${mediaItemId.value}/edit?updated=${
      nextStatus === "published" ? "published" : "unpublished"
    }`,
  );
}
