"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { createAuthorPrivateMediaItemWithLimitCheck } from "@/db/operations/author-media-items";
import { upsertAuthorMediaExperience } from "@/db/queries/author-media-experiences";
import { getCoverSettings } from "@/db/queries/cover-settings";
import { createFranchise, franchiseIdsExist } from "@/db/queries/franchises";
import { getMediaCarrierSupportedMediaTypesById } from "@/db/queries/media-carriers";
import { upsertMediaItemMetadata } from "@/db/queries/media-item-metadata";
import { mediaTypeExistsByCode } from "@/db/queries/media-types";
import { upsertAuthorRating } from "@/db/queries/ratings";
import {
  deleteAuthorDraftMediaItem,
  getAuthorPrivateMediaItemLimitUsage,
  getAuthorMediaItemForEdit,
  getAuthorMediaItemForView,
  findPublishedMediaItemDuplicateCandidates,
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
import {
  isFirstExperienceBeforeRelease,
  parseFirstExperiencedInput,
} from "@/lib/authors/experience-date";
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
import { verifyMediaMetadataCandidateToken } from "@/lib/media/metadata-candidates";
import {
  isExactMediaItemDuplicate,
  verifyMediaItemDuplicateAcknowledgementToken,
} from "@/lib/media/media-item-duplicates";
import { isMediaTypeCode, type MediaType } from "@/lib/media/types";
import { parseRatingScoreInput } from "@/lib/ratings/score";

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

function getSafeRelativeRedirect(value: string, fallback: string) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("\n")
  ) {
    return fallback;
  }

  return value;
}

function appendRedirectParam(path: string, key: string, value: string) {
  const [pathnameWithSearch, hash = ""] = path.split("#", 2);
  const [pathname, search = ""] = pathnameWithSearch.split("?", 2);
  const searchParams = new URLSearchParams(search);

  searchParams.set(key, value);

  const queryString = searchParams.toString();
  const nextPath = queryString ? `${pathname}?${queryString}` : pathname;

  return hash ? `${nextPath}#${hash}` : nextPath;
}

function getCreateSuccessRedirect(formData: FormData, key: string, fallback: string) {
  return getSafeRelativeRedirect(
    getFormString(formData, key),
    fallback,
  );
}

function getCreateErrorParamName(formData: FormData) {
  const errorParamName = getFormString(formData, "errorParamName");

  return /^[a-zA-Z][a-zA-Z0-9-]*$/.test(errorParamName) ? errorParamName : "error";
}

function getCreateErrorRedirect(formData: FormData, error: string) {
  const errorRedirectTo = getSafeRelativeRedirect(
    getFormString(formData, "errorRedirectTo"),
    "/author/media/new",
  );

  return appendRedirectParam(errorRedirectTo, getCreateErrorParamName(formData), error);
}

function getCreateIntent(formData: FormData) {
  return getFormString(formData, "intent") === "submit" ? "submit" : "draft";
}

function readCreateRatingScore(formData: FormData) {
  if (!formData.has("ratingScore")) {
    return { ok: true as const, value: null };
  }

  const score = parseRatingScoreInput(formData.get("ratingScore"));

  if (score === null) {
    return { ok: false as const, error: "invalid-rating" };
  }

  return { ok: true as const, value: score };
}

function readCreateFirstExperience(
  formData: FormData,
  input: {
    releaseYear: number | null;
    shouldSave: boolean;
  },
) {
  if (!input.shouldSave) {
    return { ok: true as const, value: null };
  }

  const firstExperiencedValue = getFormString(formData, "firstExperiencedValue");
  const firstExperiencedPrecision = getFormString(formData, "firstExperiencedPrecision");

  if (!firstExperiencedValue && !firstExperiencedPrecision) {
    return { ok: true as const, value: null };
  }

  const firstExperience = parseFirstExperiencedInput(
    firstExperiencedValue,
    firstExperiencedPrecision,
  );

  if (!firstExperience) {
    return { ok: false as const, error: "invalid-experience" };
  }

  if (
    isFirstExperienceBeforeRelease({
      firstExperiencedAt: firstExperience.firstExperiencedAt,
      releaseYear: input.releaseYear,
    })
  ) {
    return { ok: false as const, error: "experience-before-release" };
  }

  return { ok: true as const, value: firstExperience };
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

function getOptionalMetadataCandidateToken(formData: FormData) {
  return normalizeOptionalFormString(getFormString(formData, "metadataCandidateToken"));
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

function readAuthorMediaForm(formData: FormData, options?: { mediaType?: MediaType }) {
  const title = getFormString(formData, "title");
  const mediaType = options?.mediaType ?? parseMediaType(getFormString(formData, "mediaType"));
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

async function saveMediaItemMetadataFromForm(formData: FormData, mediaItemId: number) {
  const metadataCandidateToken = getOptionalMetadataCandidateToken(formData);

  if (!metadataCandidateToken) {
    return { ok: true as const };
  }

  const metadata = verifyMediaMetadataCandidateToken(metadataCandidateToken);

  if (!metadata) {
    return { ok: false as const };
  }

  await upsertMediaItemMetadata({
    mediaItemId,
    facts: metadata.facts,
    sourceProvider: metadata.provider,
    sourceExternalId: metadata.externalId,
    sourceUrl: metadata.sourceUrl,
  });

  return { ok: true as const };
}

function hasValidMediaItemMetadataToken(formData: FormData) {
  const metadataCandidateToken = getOptionalMetadataCandidateToken(formData);

  return !metadataCandidateToken || Boolean(verifyMediaMetadataCandidateToken(metadataCandidateToken));
}

async function validateMediaItemDuplicateCheck(
  formData: FormData,
  input: {
    mediaType: MediaType;
    originalTitle: string | null;
    releaseYear: number | null;
    title: string;
  },
) {
  const matches = await findPublishedMediaItemDuplicateCandidates(input);
  const exactMatches = matches.filter((match) => isExactMediaItemDuplicate(input, match));

  if (exactMatches.length > 0) {
    return { ok: false as const, error: "duplicate-media-exact" };
  }

  const possibleMatches = matches.filter((match) => !exactMatches.includes(match));

  if (possibleMatches.length === 0) {
    return { ok: true as const };
  }

  const isAcknowledged = getFormString(formData, "mediaDuplicateAcknowledged") === "1";
  const acknowledgementToken = getFormString(formData, "mediaDuplicateCheckToken");

  if (
    !isAcknowledged ||
    !verifyMediaItemDuplicateAcknowledgementToken(acknowledgementToken, {
      form: input,
      matches: possibleMatches,
    })
  ) {
    return { ok: false as const, error: "duplicate-media-possible" };
  }

  return { ok: true as const };
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
  const ratingScore = readCreateRatingScore(formData);
  const createIntent = getCreateIntent(formData);

  if (!form.ok) {
    redirect(getCreateErrorRedirect(formData, form.error));
  }

  if (!ratingScore.ok) {
    redirect(getCreateErrorRedirect(formData, ratingScore.error));
  }

  const firstExperience = readCreateFirstExperience(formData, {
    releaseYear: form.value.releaseYear,
    shouldSave: ratingScore.value !== null,
  });

  if (!firstExperience.ok) {
    redirect(getCreateErrorRedirect(formData, firstExperience.error));
  }

  if (!hasValidMediaItemMetadataToken(formData)) {
    redirect(getCreateErrorRedirect(formData, "invalid-metadata"));
  }

  if (!(await areKnownFranchises(form.value.franchiseIds))) {
    redirect(getCreateErrorRedirect(formData, "invalid-franchise"));
  }

  if (!(await isKnownMediaType(form.value.mediaType))) {
    redirect(getCreateErrorRedirect(formData, "required"));
  }

  const mediaCarrier = await validateMediaCarrier(form.value);

  if (!mediaCarrier.ok) {
    redirect(getCreateErrorRedirect(formData, mediaCarrier.error));
  }

  const duplicateCheck = await validateMediaItemDuplicateCheck(formData, form.value);

  if (!duplicateCheck.ok) {
    redirect(getCreateErrorRedirect(formData, duplicateCheck.error));
  }

  const limit = await canCreatePrivateMediaItem(author);

  if (!limit.ok) {
    redirect(getCreateErrorRedirect(formData, limit.reason));
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
    redirect(getCreateErrorRedirect(formData, cover.error));
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
    redirect(getCreateErrorRedirect(formData, result.reason));
  }

  const metadata = await saveMediaItemMetadataFromForm(formData, result.item.id);

  if (!metadata.ok) {
    redirect(getCreateErrorRedirect(formData, "invalid-metadata"));
  }

  await logActivity({
    action: "media.created",
    actorType: "author",
    authorId: author.id,
    entityType: "media-item",
    entityId: result.item.id,
    entityLabel: form.value.title,
    message: "Запись создана автором.",
    metadata: {
      mediaType: form.value.mediaType,
      franchiseIds: form.value.franchiseIds,
      mediaCarrierId: form.value.mediaCarrierId,
      publicationStatus: "private",
    },
  });

  if (ratingScore.value !== null) {
    await upsertAuthorRating({
      authorId: author.id,
      mediaItemId: result.item.id,
      score: ratingScore.value,
    });

    if (firstExperience.value) {
      await upsertAuthorMediaExperience({
        authorId: author.id,
        mediaItemId: result.item.id,
        ...firstExperience.value,
      });
    }

    revalidatePath("/author");
  }

  revalidatePath("/author/media");

  if (createIntent === "draft") {
    redirect(getCreateSuccessRedirect(formData, "successRedirectTo", "/author/media?created=1"));
  }

  const nextStatus = getPublicationStatusAfterAuthorSubmit({
    canPublishMediaWithoutReview: author.canPublishMediaWithoutReview,
  });
  const updatedItem = await submitAuthorMediaItemForPublication({
    authorId: author.id,
    mediaItemId: result.item.id,
    nextStatus,
  });

  if (!updatedItem) {
    redirect(getCreateErrorRedirect(formData, "publish-locked"));
  }

  if (updatedItem.publicationStatus === "published") {
    await logActivity({
      action: "media.published",
      actorType: "author",
      authorId: author.id,
      entityType: "media-item",
      entityId: updatedItem.id,
      entityLabel: form.value.title,
      message: "Запись опубликована автором.",
    });
    revalidatePath("/");
    revalidatePath(`/media/${updatedItem.code}`);
    redirect(
      getCreateSuccessRedirect(formData, "publishedSuccessRedirectTo", "/author/media?published=1"),
    );
  }

  revalidatePath("/admin/media-review");
  revalidatePath("/admin", "layout");
  await logActivity({
    action: "media.submitted",
    actorType: "author",
    authorId: author.id,
    entityType: "media-item",
    entityId: updatedItem.id,
    entityLabel: form.value.title,
    message: "Запись отправлена автором на модерацию.",
  });
  redirect(
    getCreateSuccessRedirect(formData, "submittedSuccessRedirectTo", "/author/media?submitted=1"),
  );
}

export async function updateAuthorMediaItemAction(formData: FormData) {
  const author = await requireAuthor();
  const mediaItemId = Number(getFormString(formData, "mediaItemId"));
  const removeCover = shouldRemoveCover(formData);

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const item = await getAuthorMediaItemForEdit(author.id, mediaItemId);

  if (!item) {
    notFound();
  }

  const form = readAuthorMediaForm(formData, { mediaType: item.mediaType });

  if (!form.ok) {
    redirect(`/author/media/${mediaItemId}/edit?error=${form.error}`);
  }

  if (!hasValidMediaItemMetadataToken(formData)) {
    redirect(`/author/media/${mediaItemId}/edit?error=invalid-metadata`);
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

  const metadata = await saveMediaItemMetadataFromForm(formData, mediaItemId);

  if (!metadata.ok) {
    redirect(`/author/media/${mediaItemId}/edit?error=invalid-metadata`);
  }

  await logActivity({
    action: "media.updated",
    actorType: "author",
    authorId: author.id,
    entityType: "media-item",
    entityId: mediaItemId,
    entityLabel: form.value.title,
    message: "Запись изменена автором.",
    metadata: {
      mediaType: form.value.mediaType,
      franchiseIds: form.value.franchiseIds,
      mediaCarrierId: form.value.mediaCarrierId,
    },
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

  if (updatedItem.publicationStatus === "published") {
    await logActivity({
      action: "media.published",
      actorType: "author",
      authorId: author.id,
      entityType: "media-item",
      entityId: updatedItem.id,
      entityLabel: item.title,
      message: "Запись опубликована автором.",
    });
    revalidatePath("/");
    revalidatePath(`/media/${updatedItem.code}`);
    redirect("/author/media?published=1");
  }

  revalidatePath("/admin/media-review");
  revalidatePath("/admin", "layout");
  await logActivity({
    action: "media.submitted",
    actorType: "author",
    authorId: author.id,
    entityType: "media-item",
    entityId: updatedItem.id,
    entityLabel: item.title,
    message: "Запись отправлена автором на модерацию.",
  });
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
  revalidatePath("/admin/media-review");
  revalidatePath("/admin", "layout");
  await logActivity({
    action: "media.withdrawn",
    actorType: "author",
    authorId: author.id,
    entityType: "media-item",
    entityId: updatedItem.id,
    entityLabel: item.title,
    message: "Заявка записи отозвана автором.",
  });
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
  await logActivity({
    action: "media.deleted",
    actorType: "author",
    authorId: author.id,
    entityType: "media-item",
    entityId: deletedItem.id,
    entityLabel: item.title,
    message: "Непубличная запись удалена автором.",
    metadata: {
      publicationStatus: deletedItem.publicationStatus,
    },
  });
  redirect("/author/media?deleted=1");
}
