"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  attachAuthorPrivateMediaItemCover,
  createAuthorPrivateMediaItemWithLimitCheck,
  getAuthorMediaItemByCreationRequestId,
} from "@/db/operations/author-media-items";
import { upsertAuthorMediaExperience } from "@/db/queries/author-media-experiences";
import { getCoverSettings } from "@/db/queries/cover-settings";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import {
  authorCanUseFranchiseIds,
  createFranchise,
  getPublishedFranchiseOptionById,
  moveAuthorFranchisesForMediaSubmission,
} from "@/db/queries/franchises";
import { getMediaCarrierSupportedMediaTypesById } from "@/db/queries/media-carriers";
import {
  deleteMediaItemMetadata,
  upsertMediaItemMetadata,
} from "@/db/queries/media-item-metadata";
import {
  getAccessibleMediaTypeCodes,
} from "@/db/queries/media-types";
import { upsertAuthorRating } from "@/db/queries/ratings";
import {
  deleteAuthorDraftMediaItem,
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
  canAuthorDeleteMediaItem,
  canAuthorWithdrawPublicationRequest,
  getFranchisePublicationStatusAfterAuthorCreate,
  getFranchisePublicationStatusAfterAuthorSubmit,
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
  deleteUploadedCoverFilesIfNeeded,
  isS3ObjectKey,
  resolveCoverUpload,
} from "@/lib/covers/storage";
import type { CoverSourceInput } from "@/lib/covers/types";
import {
  resolveMediaMetadataFormMutation,
  type MediaMetadataFormMutation,
} from "@/lib/media/metadata-form-mutation";
import { validateMediaItemDuplicateCheck } from "@/lib/media/validate-media-item-duplicate-check";
import { normalizeMediaItemTitleAliases } from "@/lib/media/title-aliases";
import { isMediaTypeCode, type MediaType } from "@/lib/media/types";
import { parseRatingScoreInput } from "@/lib/ratings/score";
import { validateFranchiseDuplicateCheck } from "@/lib/franchises/validate-franchise-duplicate-check";
import { enqueueJobRun } from "@/lib/jobs/queue";

export type CreateAuthorInlineFranchiseState = {
  error: string | null;
  franchise: {
    code: string;
    id: number;
    title: string;
    originalTitle: string | null;
    parentIds: number[];
    path: string;
    publicationStatus: "private" | "submitted" | "published" | "rejected";
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

function getCreateSuccessRedirectWithMediaItem(
  formData: FormData,
  key: string,
  fallback: string,
  item: { code: string; id: number },
) {
  const redirectPath = getCreateSuccessRedirect(formData, key, fallback);
  const pathWithId = appendRedirectParam(redirectPath, "suggestedItemId", String(item.id));

  return appendRedirectParam(pathWithId, "suggestedItemCode", item.code);
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

function getSavedDraftErrorRedirect(mediaItemId: number, error: string) {
  return `/author/media/${mediaItemId}/edit?error=${encodeURIComponent(error)}`;
}

function getExistingCreationRedirect(item: {
  code: string;
  id: number;
  publicationStatus: "private" | "submitted" | "published" | "rejected";
}) {
  if (item.publicationStatus === "published") {
    return `/media/${encodeURIComponent(item.code)}`;
  }

  if (item.publicationStatus === "private" || item.publicationStatus === "rejected") {
    return getSavedDraftErrorRedirect(item.id, "already-created");
  }

  return `/author/media?q=${encodeURIComponent(item.code)}&error=already-created`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  const parentId = parseOptionalPositiveInteger(getFormString(formData, "parentId"));

  if (!title) {
    return { ok: false as const, error: "required" };
  }

  if (!parentId.ok) {
    return { ok: false as const, error: "invalid-franchise" };
  }

  return {
    ok: true as const,
    value: {
      title,
      originalTitle: normalizeOptionalFormString(getFormString(formData, "originalTitle")),
      description: normalizeOptionalFormString(getFormString(formData, "description")),
      parentId: parentId.value,
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

  const originalTitle = normalizeOptionalFormString(getFormString(formData, "originalTitle"));
  const aliases = normalizeMediaItemTitleAliases(
    formData.getAll("titleAliases").filter((value): value is string => typeof value === "string"),
    { title, originalTitle },
  );

  return {
    ok: true as const,
    value: {
      title,
      originalTitle,
      aliases,
      description: normalizeOptionalFormString(getFormString(formData, "description")),
      mediaType,
      franchiseIds: franchiseIds.value,
      mediaCarrierId: mediaCarrierId.value,
      releaseYear: releaseYear.value,
    },
  };
}

async function canAuthorUseFranchises(authorId: number, franchiseIds: number[]) {
  return authorCanUseFranchiseIds({ authorId, ids: franchiseIds });
}

async function canAuthorCreateMediaType(authorId: number, mediaType: MediaType) {
  return (await getAccessibleMediaTypeCodes(authorId)).includes(mediaType);
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

function getMediaItemMetadataMutation(formData: FormData, expectedMediaType: MediaType) {
  return resolveMediaMetadataFormMutation({
    expectedMediaType,
    metadataCandidateToken: getOptionalMetadataCandidateToken(formData),
    titleSourceToken:
      normalizeOptionalFormString(getFormString(formData, "metadataTitleSourceToken")),
    sourceChanged: getFormString(formData, "metadataSourceChanged") === "1",
  });
}

async function saveMediaItemMetadataMutation(
  mutation: Exclude<MediaMetadataFormMutation, { type: "reject" }>,
  mediaItemId: number,
) {
  if (mutation.type === "keep") {
    return;
  }

  if (mutation.type === "delete") {
    await deleteMediaItemMetadata(mediaItemId);
    return;
  }

  await upsertMediaItemMetadata({
    mediaItemId,
    facts: mutation.facts,
    sourceProvider: mutation.sourceProvider,
    sourceExternalId: mutation.sourceExternalId,
    sourceUrl: mutation.sourceUrl,
    fetchedAt: mutation.fetchedAt,
  });
}

export async function createAuthorInlineFranchiseAction(
  _previousState: CreateAuthorInlineFranchiseState,
  formData: FormData,
): Promise<CreateAuthorInlineFranchiseState> {
  const author = await requireAuthor();

  const input = readFranchiseForm(formData);

  if (!input.ok) {
    return { error: input.error, franchise: null };
  }

  const parent = input.value.parentId
    ? await getPublishedFranchiseOptionById(input.value.parentId)
    : null;

  if (input.value.parentId && !parent) {
    return { error: "invalid-franchise", franchise: null };
  }

  const duplicateCheck = await validateFranchiseDuplicateCheck(formData, input.value);
  if (!duplicateCheck.ok) {
    return { error: duplicateCheck.error, franchise: null };
  }

  let franchise;

  try {
    franchise = await createFranchise({
      ...input.value,
      code: generateEntityCode({ type: "series", name: input.value.title }),
      createdByAuthorId: author.id,
      publicationStatus: getFranchisePublicationStatusAfterAuthorCreate({
        canPublishFranchisesWithoutReview: author.canPublishFranchisesWithoutReview,
      }),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "duplicate-code", franchise: null };
    }

    if (error instanceof Error && error.message === "franchise-depth-limit") {
      return { error: "franchise-depth-limit", franchise: null };
    }

    console.error(error);
    return { error: getAdminFormErrorCode(error), franchise: null };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/series");
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
      code: franchise.code,
      id: franchise.id,
      title: input.value.title,
      originalTitle: input.value.originalTitle,
      parentIds: parent ? [...parent.parentIds, parent.id] : [],
      path: parent ? `${parent.path} / ${input.value.title}` : input.value.title,
      publicationStatus: franchise.publicationStatus,
    },
  };
}

export async function createAuthorMediaItemAction(formData: FormData) {
  const author = await requireAuthor();
  const authorCreationRequestId = getFormString(formData, "authorCreationRequestId");
  const form = readAuthorMediaForm(formData);
  const ratingScore = readCreateRatingScore(formData);
  const createIntent = getCreateIntent(formData);

  if (!isUuid(authorCreationRequestId)) {
    redirect(getCreateErrorRedirect(formData, "required"));
  }

  const existingItem = await getAuthorMediaItemByCreationRequestId({
    authorId: author.id,
    authorCreationRequestId,
  });

  if (existingItem) {
    redirect(getExistingCreationRedirect(existingItem));
  }

  if (!form.ok) {
    redirect(getCreateErrorRedirect(formData, form.error));
  }

  const { maxTitleAliases } = await getArchiveSettings();

  if (form.value.aliases.length > maxTitleAliases) {
    redirect(getCreateErrorRedirect(formData, `too-many-aliases-${maxTitleAliases}`));
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

  const metadataMutation = getMediaItemMetadataMutation(formData, form.value.mediaType);

  if (metadataMutation.type === "reject") {
    redirect(getCreateErrorRedirect(formData, "invalid-metadata"));
  }

  if (!(await canAuthorUseFranchises(author.id, form.value.franchiseIds))) {
    redirect(getCreateErrorRedirect(formData, "invalid-franchise"));
  }

  if (!(await canAuthorCreateMediaType(author.id, form.value.mediaType))) {
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

  const code = buildAuthorMediaCode({
    mediaType: form.value.mediaType,
    title: form.value.title,
    uniqueId: randomUUID().slice(0, 8),
  });
  const result = await createAuthorPrivateMediaItemWithLimitCheck({
    authorId: author.id,
    authorCreationRequestId,
    code,
    coverUrl: null,
    coverThumbUrl: null,
    coverSource: { provider: null, externalId: null, pageUrl: null },
    limits: {
      maxDraftMediaItems: author.maxDraftMediaItems,
      maxDraftMediaItemsPerDay: author.maxDraftMediaItemsPerDay,
    },
    ...form.value,
  });

  if (!result.ok) {
    redirect(getCreateErrorRedirect(formData, result.reason));
  }

  if (!result.created) {
    redirect(getExistingCreationRedirect(result.item));
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

  const coverFile = getOptionalCoverFile(formData);
  const coverCandidateToken = getOptionalCoverCandidateToken(formData);
  const coverSettings = await getCoverSettings();
  const cover = await resolveCoverUpload({
    authorId: author.id,
    mediaItemCode: code,
    coverFile,
    candidateToken: coverCandidateToken,
    maxBytes: coverSettings.coverMaxBytes,
  });

  if (!cover.ok) {
    console.error("author media cover upload failed", {
      errorCode: cover.error,
      mediaItemId: result.item.id,
      source: coverFile ? "manual" : coverCandidateToken ? "provider" : "none",
      stage: "original-upload",
    });
    await logActivity({
      action: "media.cover-upload.failed",
      actorType: "author",
      authorId: author.id,
      entityType: "media-item",
      entityId: result.item.id,
      entityLabel: form.value.title,
      status: "failure",
      severity: "warning",
      message: "Запись сохранена, но обложку загрузить не удалось.",
      metadata: {
        errorCode: cover.error,
        retryable: cover.error === "cover-upload",
        source: coverFile ? "manual" : coverCandidateToken ? "provider" : "none",
        stage: "original-upload",
        ...cover.diagnostic,
      },
    });
    redirect(getSavedDraftErrorRedirect(result.item.id, "cover-upload-saved"));
  }

  if (cover.coverUrl) {
    const attached = await attachAuthorPrivateMediaItemCover({
      authorId: author.id,
      mediaItemId: result.item.id,
      coverUrl: cover.coverUrl,
      coverThumbUrl: cover.coverThumbUrl,
      coverSource: cover.source,
    });

    if (!attached) {
      console.error("author media cover attach failed", {
        mediaItemId: result.item.id,
        stage: "database-attach",
      });
      await logActivity({
        action: "media.cover-upload.failed",
        actorType: "author",
        authorId: author.id,
        entityType: "media-item",
        entityId: result.item.id,
        entityLabel: form.value.title,
        status: "failure",
        severity: "warning",
        message: "Обложка загружена, но не была привязана к записи.",
        metadata: {
          errorCode: "cover-attach",
          retryable: true,
          stage: "database-attach",
        },
      });
      await deleteUploadedCoverFilesIfNeeded({
        coverUrl: cover.coverUrl,
        coverThumbUrl: cover.coverThumbUrl,
      }).catch((error) => console.error("cover cleanup after attach failure", {
        errorName: error instanceof Error ? error.name : typeof error,
        mediaItemId: result.item.id,
      }));
      redirect(getSavedDraftErrorRedirect(result.item.id, "cover-upload-saved"));
    }

    if (cover.thumbnailError) {
      console.error("author media cover thumbnail failed", {
        errorCode: cover.thumbnailError,
        mediaItemId: result.item.id,
        stage: "thumbnail",
      });
      await logActivity({
        action: "media.cover-thumbnail.failed",
        actorType: "author",
        authorId: author.id,
        entityType: "media-item",
        entityId: result.item.id,
        entityLabel: form.value.title,
        status: "failure",
        severity: "warning",
        message: "Оригинал обложки сохранён, но миниатюра не создана.",
        metadata: {
          errorCode: cover.thumbnailError,
          retryable: cover.thumbnailError === "cover-thumbnail-upload",
          source: coverFile ? "manual" : "provider",
          stage: "thumbnail",
        },
      });
      await enqueueJobRun({
        payload: { mediaItemId: result.item.id },
        source: "event",
        type: "media.cover-thumbnails-backfill",
      }).catch((error) => console.error("cover thumbnail enqueue failed", {
        errorName: error instanceof Error ? error.name : typeof error,
        mediaItemId: result.item.id,
      }));
    }
  }

  await saveMediaItemMetadataMutation(metadataMutation, result.item.id);

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
    redirect(
      getCreateSuccessRedirectWithMediaItem(
        formData,
        "successRedirectTo",
        "/author/media?created=1",
        result.item,
      ),
    );
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

  await moveAuthorFranchisesForMediaSubmission({
    authorId: author.id,
    mediaItemId: updatedItem.id,
    nextStatus: getFranchisePublicationStatusAfterAuthorSubmit({
      canPublishFranchisesWithoutReview: author.canPublishFranchisesWithoutReview,
    }),
  });

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
    revalidatePath("/archive");
    revalidatePath(`/media/${updatedItem.code}`);
    redirect(
      getCreateSuccessRedirectWithMediaItem(
        formData,
        "publishedSuccessRedirectTo",
        "/author/media?published=1",
        updatedItem,
      ),
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
    getCreateSuccessRedirectWithMediaItem(
      formData,
      "submittedSuccessRedirectTo",
      "/author/media?submitted=1",
      updatedItem,
    ),
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

  if (!(await canAuthorCreateMediaType(author.id, item.mediaType))) {
    notFound();
  }

  const form = readAuthorMediaForm(formData, { mediaType: item.mediaType });

  if (!form.ok) {
    redirect(`/author/media/${mediaItemId}/edit?error=${form.error}`);
  }

  const { maxTitleAliases } = await getArchiveSettings();

  if (form.value.aliases.length > maxTitleAliases) {
    redirect(`/author/media/${mediaItemId}/edit?error=too-many-aliases-${maxTitleAliases}`);
  }

  const duplicateCheck = await validateMediaItemDuplicateCheck(formData, {
    ...form.value,
    excludeMediaItemId: mediaItemId,
  });

  if (!duplicateCheck.ok) {
    redirect(`/author/media/${mediaItemId}/edit?error=${duplicateCheck.error}`);
  }

  const metadataMutation = getMediaItemMetadataMutation(formData, form.value.mediaType);

  if (metadataMutation.type === "reject") {
    redirect(`/author/media/${mediaItemId}/edit?error=invalid-metadata`);
  }

  if (!(await canAuthorUseFranchises(author.id, form.value.franchiseIds))) {
    redirect(`/author/media/${mediaItemId}/edit?error=invalid-franchise`);
  }

  if (!(await canAuthorCreateMediaType(author.id, form.value.mediaType))) {
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
    console.error("author media cover update failed", {
      errorCode: cover.error,
      mediaItemId,
      stage: "original-upload",
    });
    await logActivity({
      action: "media.cover-upload.failed",
      actorType: "author",
      authorId: author.id,
      entityType: "media-item",
      entityId: mediaItemId,
      entityLabel: form.value.title,
      status: "failure",
      severity: "warning",
      message: "Не удалось обновить обложку записи.",
      metadata: {
        errorCode: cover.error,
        retryable: cover.error === "cover-upload",
        stage: "original-upload",
        ...cover.diagnostic,
      },
    });
    redirect(`/author/media/${mediaItemId}/edit?error=${cover.error}`);
  }

  const nextCoverUrl = removeCover ? null : (cover.coverUrl ?? item.coverUrl);
  const nextCoverThumbUrl = removeCover
    ? null
    : cover.coverUrl
      ? cover.coverThumbUrl
      : item.coverThumbUrl;
  const nextCoverSource =
    removeCover || cover.coverUrl ? cover.source : getCoverSourceFromItem(item);

  try {
    await updateAuthorMediaItem({
      authorId: author.id,
      mediaItemId,
      coverUrl: nextCoverUrl,
      coverThumbUrl: nextCoverThumbUrl,
      coverSource: nextCoverSource,
      ...form.value,
    });
  } catch (error) {
    if (cover.coverUrl) {
      await deleteUploadedCoverFilesIfNeeded({
        coverUrl: cover.coverUrl,
        coverThumbUrl: cover.coverThumbUrl,
      }).catch((cleanupError) => console.error("cover cleanup after media update failure", {
        errorName: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
        mediaItemId,
      }));
    }
    throw error;
  }

  if ((removeCover || cover.coverUrl) && isS3ObjectKey(item.coverUrl)) {
    await deleteUploadedCoverFilesIfNeeded({
      coverUrl: item.coverUrl,
      coverThumbUrl: item.coverThumbUrl,
    }).catch((error) => console.error("previous cover cleanup failed", {
      errorName: error instanceof Error ? error.name : typeof error,
      mediaItemId,
    }));
  }

  if (cover.coverUrl && cover.thumbnailError) {
    console.error("author media cover thumbnail update failed", {
      errorCode: cover.thumbnailError,
      mediaItemId,
      stage: "thumbnail",
    });
    await logActivity({
      action: "media.cover-thumbnail.failed",
      actorType: "author",
      authorId: author.id,
      entityType: "media-item",
      entityId: mediaItemId,
      entityLabel: form.value.title,
      status: "failure",
      severity: "warning",
      message: "Оригинал обложки сохранён, но миниатюра не создана.",
      metadata: {
        errorCode: cover.thumbnailError,
        retryable: cover.thumbnailError === "cover-thumbnail-upload",
        stage: "thumbnail",
      },
    });
    await enqueueJobRun({
      payload: { mediaItemId },
      source: "event",
      type: "media.cover-thumbnails-backfill",
    }).catch((error) => console.error("cover thumbnail enqueue failed", {
      errorName: error instanceof Error ? error.name : typeof error,
      mediaItemId,
    }));
  }

  await saveMediaItemMetadataMutation(metadataMutation, mediaItemId);

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

  if (!(await canAuthorCreateMediaType(author.id, item.mediaType))) {
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

  await moveAuthorFranchisesForMediaSubmission({
    authorId: author.id,
    mediaItemId: updatedItem.id,
    nextStatus: getFranchisePublicationStatusAfterAuthorSubmit({
      canPublishFranchisesWithoutReview: author.canPublishFranchisesWithoutReview,
    }),
  });

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
    revalidatePath("/archive");
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

  if (!(await canAuthorCreateMediaType(author.id, item.mediaType))) {
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
