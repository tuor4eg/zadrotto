"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorExistsById } from "@/db/queries/authors";
import { franchiseExistsById } from "@/db/queries/franchises";
import { getMediaCarrierMediaTypeById } from "@/db/queries/media-carriers";
import {
  createAdminMediaItem,
  deleteAdminMediaItemIfUnrated,
  getAdminMediaItemIdentityById,
  updateAdminMediaItem,
} from "@/db/queries/media-items";
import {
  getCoverFileExtension,
  normalizeOptionalFormString,
  parseOptionalPositiveInteger,
  parseOptionalReleaseYear,
  validateCoverFileInput,
} from "@/lib/author-media-form";
import { validateMediaCarrierForMediaType } from "@/lib/media-carrier-form";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminFormErrorCode } from "@/lib/app-error-messages";
import { generateEntityCode } from "@/lib/generated-code";
import { MEDIA_TYPES, type MediaType } from "@/lib/media-types";
import { deleteS3Object, uploadS3Object } from "@/lib/storage";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseMediaType(value: string): MediaType | null {
  return MEDIA_TYPES.some((mediaType) => mediaType === value) ? (value as MediaType) : null;
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

function shouldRemoveCover(formData: FormData) {
  return getFormString(formData, "coverAction") === "remove";
}

function isS3ObjectKey(coverUrl: string | null) {
  const normalizedCoverUrl = coverUrl?.trim();

  if (!normalizedCoverUrl) {
    return false;
  }

  return !/^https?:\/\//i.test(normalizedCoverUrl);
}

function buildAdminCoverObjectKey(mediaItemCode: string, contentType: string) {
  const extension = getCoverFileExtension(contentType);

  if (!extension) {
    return null;
  }

  return `covers/media-items/${mediaItemCode}-${randomUUID().slice(0, 12)}.${extension}`;
}

async function uploadOptionalCover(input: {
  mediaItemCode: string;
  coverFile: File | null;
}) {
  if (!input.coverFile) {
    return { ok: true as const, coverUrl: null };
  }

  const validation = validateCoverFileInput({
    size: input.coverFile.size,
    type: input.coverFile.type,
  });

  if (!validation.ok) {
    return validation;
  }

  const objectKey = buildAdminCoverObjectKey(input.mediaItemCode, input.coverFile.type);

  if (!objectKey) {
    return { ok: false as const, error: "cover-type" };
  }

  try {
    await uploadS3Object({
      objectKey,
      body: Buffer.from(await input.coverFile.arrayBuffer()),
      contentType: input.coverFile.type,
    });
  } catch {
    return { ok: false as const, error: "cover-upload" };
  }

  return { ok: true as const, coverUrl: objectKey };
}

function readMediaForm(formData: FormData, options?: { requireAuthor?: boolean }) {
  const title = getFormString(formData, "title");
  const mediaType = parseMediaType(getFormString(formData, "mediaType"));
  const releaseYear = parseOptionalReleaseYear(getFormString(formData, "releaseYear"));
  const franchiseId = parseOptionalPositiveInteger(getFormString(formData, "franchiseId"));
  const mediaCarrierId = parseOptionalPositiveInteger(getFormString(formData, "mediaCarrierId"));
  const authorId = parseOptionalPositiveInteger(getFormString(formData, "authorId"));

  if (!title || !mediaType) {
    return { ok: false as const, error: "required" };
  }

  if (!releaseYear.ok) {
    return { ok: false as const, error: "invalid-year" };
  }

  if (!franchiseId.ok) {
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
      franchiseId: franchiseId.value,
      mediaCarrierId: mediaCarrierId.value,
      authorId: authorId.value,
      releaseYear: releaseYear.value,
    },
  };
}

async function isKnownFranchise(franchiseId: number | null) {
  return franchiseId === null || franchiseExistsById(franchiseId);
}

async function isKnownAuthor(authorId: number | null) {
  return authorId === null || authorExistsById(authorId);
}

async function validateMediaCarrier(input: {
  mediaCarrierId: number | null;
  mediaType: MediaType;
}) {
  const mediaCarrierMediaType = input.mediaCarrierId
    ? await getMediaCarrierMediaTypeById(input.mediaCarrierId)
    : null;

  return validateMediaCarrierForMediaType({
    mediaCarrierId: input.mediaCarrierId,
    mediaCarrierMediaType,
    mediaType: input.mediaType,
  });
}

function revalidateMediaSurfaces(input: {
  id: number;
  code: string;
  franchiseId: number | null;
  franchiseCode: string | null;
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

  if (input.franchiseCode) {
    revalidatePath(`/franchises/${input.franchiseCode}`);
  }

  if (input.franchiseId) {
    revalidatePath(`/admin/franchises/${input.franchiseId}/edit`);
  }
}

export async function updateAdminMediaItemAction(formData: FormData) {
  await requireAdminUser();

  const mediaItemId = parseRequiredMediaItemId(getFormString(formData, "mediaItemId"));
  const removeCover = shouldRemoveCover(formData);
  const form = readMediaForm(formData, { requireAuthor: true });

  if (!mediaItemId.ok) {
    redirect("/admin/media?error=invalid-media");
  }

  if (!form.ok) {
    redirect(`/admin/media/${mediaItemId.value}/edit?error=${form.error}`);
  }

  if (!(await isKnownFranchise(form.value.franchiseId))) {
    redirect(`/admin/media/${mediaItemId.value}/edit?error=invalid-franchise`);
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

  const cover = await uploadOptionalCover({
    mediaItemCode: existingItem.code,
    coverFile: removeCover ? null : getOptionalCoverFile(formData),
  });

  if (!cover.ok) {
    redirect(`/admin/media/${mediaItemId.value}/edit?error=${cover.error}`);
  }

  if (removeCover && isS3ObjectKey(existingItem.coverUrl)) {
    try {
      await deleteS3Object({ objectKey: existingItem.coverUrl! });
    } catch {
      redirect(`/admin/media/${mediaItemId.value}/edit?error=cover-delete`);
    }
  }

  try {
    const updatedItem = await updateAdminMediaItem({
      mediaItemId: mediaItemId.value,
      coverUrl: removeCover ? null : (cover.coverUrl ?? existingItem.coverUrl),
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

    if (existingItem.franchiseCode && existingItem.franchiseCode !== nextIdentity.franchiseCode) {
      revalidatePath(`/franchises/${existingItem.franchiseCode}`);
    }
  }

  redirect(`/admin/media/${mediaItemId.value}/edit?updated=1`);
}

export async function createAdminMediaItemAction(formData: FormData) {
  await requireAdminUser();

  const form = readMediaForm(formData, { requireAuthor: true });

  if (!form.ok) {
    redirect(`/admin/media/new?error=${form.error}`);
  }

  if (form.value.authorId === null) {
    redirect("/admin/media/new?error=author-required");
  }

  if (!(await isKnownFranchise(form.value.franchiseId))) {
    redirect("/admin/media/new?error=invalid-franchise");
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
  const cover = await uploadOptionalCover({
    mediaItemCode: code,
    coverFile: getOptionalCoverFile(formData),
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
      ...mediaInput,
    });
  } catch (error) {
    console.error(error);
    redirect(`/admin/media/new?error=${getAdminFormErrorCode(error)}`);
  }

  const identity = await getAdminMediaItemIdentityById(item.id);

  if (identity) {
    revalidateMediaSurfaces(identity);
  }

  redirect(`/admin/media/${item.id}/edit?created=1`);
}

export async function deleteAdminMediaItemAction(formData: FormData) {
  await requireAdminUser();

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
      await deleteS3Object({ objectKey: existingItem.coverUrl! });
    } catch (error) {
      console.error(error);
    }
  }

  revalidateMediaSurfaces(existingItem);
  redirect("/admin/media?deleted=1");
}
