"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { franchiseExistsById } from "@/db/queries/franchises";
import {
  createAuthorMediaItem,
  getAuthorMediaItemForEdit,
  getAuthorMediaItemForView,
  submitAuthorMediaItemForPublication,
  updateAuthorMediaItem,
} from "@/db/queries/media-items";
import {
  buildAuthorCoverObjectKey,
  buildAuthorMediaCode,
  isAuthorEditablePublicationStatus,
  normalizeOptionalFormString,
  parseOptionalPositiveInteger,
  parseOptionalReleaseYear,
  validateCoverFileInput,
} from "@/lib/author-media-form";
import { requireAuthor } from "@/lib/author-auth";
import { getPublicationStatusAfterAuthorSubmit } from "@/lib/author-media-publication";
import { listAuthorPermissions } from "@/lib/author-permission-service";
import { MEDIA_TYPES, type MediaType } from "@/lib/media-types";
import { deleteS3Object, uploadS3Object } from "@/lib/storage";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseMediaType(value: string): MediaType | null {
  return MEDIA_TYPES.some((mediaType) => mediaType === value) ? (value as MediaType) : null;
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

async function uploadOptionalCover(input: {
  authorId: number;
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

  const objectKey = buildAuthorCoverObjectKey({
    authorId: input.authorId,
    mediaItemCode: input.mediaItemCode,
    contentType: input.coverFile.type,
    uniqueId: randomUUID().slice(0, 12),
  });

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

function readAuthorMediaForm(formData: FormData) {
  const title = getFormString(formData, "title");
  const mediaType = parseMediaType(getFormString(formData, "mediaType"));
  const releaseYear = parseOptionalReleaseYear(getFormString(formData, "releaseYear"));
  const franchiseId = parseOptionalPositiveInteger(getFormString(formData, "franchiseId"));

  if (!title || !mediaType) {
    return { ok: false as const, error: "required" };
  }

  if (!releaseYear.ok) {
    return { ok: false as const, error: "invalid-year" };
  }

  if (!franchiseId.ok) {
    return { ok: false as const, error: "invalid-franchise" };
  }

  return {
    ok: true as const,
    value: {
      title,
      originalTitle: normalizeOptionalFormString(getFormString(formData, "originalTitle")),
      description: normalizeOptionalFormString(getFormString(formData, "description")),
      mediaType,
      franchiseId: franchiseId.value,
      releaseYear: releaseYear.value,
    },
  };
}

async function isKnownFranchise(franchiseId: number | null) {
  return franchiseId === null || franchiseExistsById(franchiseId);
}

export async function createAuthorMediaItemAction(formData: FormData) {
  const author = await requireAuthor();
  const form = readAuthorMediaForm(formData);

  if (!form.ok) {
    redirect(`/author/media/new?error=${form.error}`);
  }

  if (!(await isKnownFranchise(form.value.franchiseId))) {
    redirect("/author/media/new?error=invalid-franchise");
  }

  const code = buildAuthorMediaCode({
    mediaType: form.value.mediaType,
    title: form.value.title,
    uniqueId: randomUUID().slice(0, 8),
  });
  const cover = await uploadOptionalCover({
    authorId: author.id,
    mediaItemCode: code,
    coverFile: getOptionalCoverFile(formData),
  });

  if (!cover.ok) {
    redirect(`/author/media/new?error=${cover.error}`);
  }

  await createAuthorMediaItem({
    authorId: author.id,
    code,
    coverUrl: cover.coverUrl,
    ...form.value,
  });

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

  if (!(await isKnownFranchise(form.value.franchiseId))) {
    redirect(`/author/media/${mediaItemId}/edit?error=invalid-franchise`);
  }

  const item = await getAuthorMediaItemForEdit(author.id, mediaItemId);

  if (!item) {
    notFound();
  }

  if (!isAuthorEditablePublicationStatus(item.publicationStatus)) {
    redirect("/author/media?error=locked");
  }

  const cover = await uploadOptionalCover({
    authorId: author.id,
    mediaItemCode: `media-${mediaItemId}`,
    coverFile: removeCover ? null : getOptionalCoverFile(formData),
  });

  if (!cover.ok) {
    redirect(`/author/media/${mediaItemId}/edit?error=${cover.error}`);
  }

  if (removeCover && isS3ObjectKey(item.coverUrl)) {
    try {
      await deleteS3Object({ objectKey: item.coverUrl! });
    } catch {
      redirect(`/author/media/${mediaItemId}/edit?error=cover-delete`);
    }
  }

  await updateAuthorMediaItem({
    authorId: author.id,
    mediaItemId,
    coverUrl: removeCover ? null : (cover.coverUrl ?? item.coverUrl),
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

  const permissions = await listAuthorPermissions(author.id);
  const nextStatus = getPublicationStatusAfterAuthorSubmit(permissions);
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
  redirect("/author/media?submitted=1");
}
