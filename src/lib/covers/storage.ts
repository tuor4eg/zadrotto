import { randomUUID } from "node:crypto";
import sharp from "sharp";

import {
  buildAuthorCoverObjectKey,
  getCoverFileExtension,
  validateCoverFileInput,
} from "@/lib/forms/author-media";
import { deleteS3Object, fetchS3Object, uploadS3Object } from "@/lib/services/minio";
import { verifyCoverCandidateToken } from "@/lib/covers/candidates";
import type { CoverSourceInput } from "@/lib/covers/types";
import { fetchProviderImage } from "@/lib/covers/provider-image-relay";

export type CoverUploadResult =
  | {
      ok: true;
      coverUrl: string | null;
      coverThumbUrl: string | null;
      thumbnailError: "cover-thumbnail-generate" | "cover-thumbnail-upload" | null;
      source: CoverSourceInput;
    }
  | {
      ok: false;
      error: "cover-type" | "cover-too-large" | "cover-upload";
    };

function buildAdminCoverObjectKey(mediaItemCode: string, contentType: string) {
  const extension = getCoverFileExtension(contentType);

  if (!extension) {
    return null;
  }

  return `covers/media-items/${mediaItemCode}-${randomUUID().slice(0, 12)}.${extension}`;
}

export function buildCoverThumbObjectKey(objectKey: string | null) {
  const normalizedObjectKey = objectKey?.trim();

  if (!normalizedObjectKey) {
    return null;
  }

  const extensionStart = normalizedObjectKey.lastIndexOf(".");

  if (extensionStart <= 0) {
    return `${normalizedObjectKey}-thumb.webp`;
  }

  return `${normalizedObjectKey.slice(0, extensionStart)}-thumb.webp`;
}

export function isS3ObjectKey(coverUrl: string | null) {
  const normalizedCoverUrl = coverUrl?.trim();

  if (!normalizedCoverUrl) {
    return false;
  }

  return !/^https?:\/\//i.test(normalizedCoverUrl);
}

export async function deleteUploadedCoverIfNeeded(coverUrl: string | null) {
  if (!isS3ObjectKey(coverUrl)) {
    return;
  }

  await deleteS3Object({ objectKey: coverUrl! });
}

export async function deleteUploadedCoverFilesIfNeeded(input: {
  coverUrl: string | null;
  coverThumbUrl?: string | null;
}) {
  const results = await Promise.allSettled([
    deleteUploadedCoverIfNeeded(input.coverUrl),
    deleteUploadedCoverIfNeeded(input.coverThumbUrl ?? null),
  ]);
  const failedResult = results.find((result) => result.status === "rejected");

  if (failedResult) {
    throw failedResult.reason;
  }
}

async function createCoverThumbBuffer(body: Buffer) {
  try {
    return await sharp(body)
      .rotate()
      .resize({
        width: 240,
        withoutEnlargement: true,
      })
      .webp({ quality: 72 })
      .toBuffer();
  } catch {
    return null;
  }
}

export async function createAndUploadCoverThumbFromObjectKey(coverUrl: string | null) {
  const result = await createCoverThumbFromObjectKey(coverUrl);

  return result.ok ? result.coverThumbUrl : null;
}

export type CoverThumbnailResult =
  | { ok: true; coverThumbUrl: string }
  | {
      ok: false;
      error: "cover-thumbnail-source" | "cover-thumbnail-generate" | "cover-thumbnail-upload";
      retryable: boolean;
    };

export async function createCoverThumbFromObjectKey(
  coverUrl: string | null,
): Promise<CoverThumbnailResult> {
  if (!isS3ObjectKey(coverUrl)) {
    return { ok: false, error: "cover-thumbnail-source", retryable: false };
  }

  const objectKey = coverUrl!.trim();
  const thumbObjectKey = buildCoverThumbObjectKey(objectKey);

  if (!thumbObjectKey) {
    return { ok: false, error: "cover-thumbnail-source", retryable: false };
  }

  let response: Awaited<ReturnType<typeof fetchS3Object>>;
  try {
    response = await fetchS3Object({ objectKey });
  } catch (error) {
    logCoverStorageError("thumbnail-source", error);
    return { ok: false, error: "cover-thumbnail-source", retryable: true };
  }

  if (!response) {
    return { ok: false, error: "cover-thumbnail-source", retryable: true };
  }

  const body = Buffer.from(await response.arrayBuffer());
  const thumbBody = await createCoverThumbBuffer(body);

  if (!thumbBody) {
    return { ok: false, error: "cover-thumbnail-generate", retryable: false };
  }

  try {
    await uploadS3Object({
      objectKey: thumbObjectKey,
      body: thumbBody,
      contentType: "image/webp",
    });
  } catch (error) {
    logCoverStorageError("thumbnail-upload", error);
    return { ok: false, error: "cover-thumbnail-upload", retryable: true };
  }

  return { ok: true, coverThumbUrl: thumbObjectKey };
}

function logCoverStorageError(stage: string, error: unknown) {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const metadata = source?.$metadata && typeof source.$metadata === "object"
    ? source.$metadata as Record<string, unknown>
    : null;
  const rawMessage = error instanceof Error ? error.message : "";
  const safeMessage = rawMessage
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(access[_-]?key|secret|token|signature)=?[^\s,]*/gi, "$1=[redacted]")
    .slice(0, 500);

  console.error("cover storage operation failed", {
    errorCode:
      typeof source?.code === "string"
        ? source.code
        : typeof source?.Code === "string"
          ? source.Code
          : null,
    errorName: error instanceof Error ? error.name : typeof error,
    httpStatusCode:
      typeof metadata?.httpStatusCode === "number" ? metadata.httpStatusCode : null,
    message: safeMessage || null,
    requestId: typeof metadata?.requestId === "string" ? metadata.requestId : null,
    stage,
  });
}

async function uploadCoverBuffer(input: {
  body: Buffer;
  contentType: string;
  objectKey: string | null;
  source: CoverSourceInput;
}): Promise<CoverUploadResult> {
  if (!input.objectKey) {
    return { ok: false, error: "cover-type" };
  }

  try {
    await uploadS3Object({
      objectKey: input.objectKey,
      body: input.body,
      contentType: input.contentType,
    });

    let uploadedThumbObjectKey: string | null = null;
    let thumbnailError: "cover-thumbnail-generate" | "cover-thumbnail-upload" | null = null;
    const thumbObjectKey = buildCoverThumbObjectKey(input.objectKey);
    const thumbBody = await createCoverThumbBuffer(input.body);

    if (thumbObjectKey && thumbBody) {
      try {
        await uploadS3Object({
          objectKey: thumbObjectKey,
          body: thumbBody,
          contentType: "image/webp",
        });
        uploadedThumbObjectKey = thumbObjectKey;
      } catch (error) {
        thumbnailError = "cover-thumbnail-upload";
        logCoverStorageError("thumbnail-upload", error);
      }
    } else {
      thumbnailError = "cover-thumbnail-generate";
    }

    return {
      ok: true,
      coverUrl: input.objectKey,
      coverThumbUrl: uploadedThumbObjectKey,
      thumbnailError,
      source: input.source,
    };
  } catch (error) {
    logCoverStorageError("original-upload", error);
    return { ok: false, error: "cover-upload" };
  }
}

function getManualCoverSource(): CoverSourceInput {
  return {
    provider: null,
    externalId: null,
    pageUrl: null,
  };
}

export async function uploadManualCover(input: {
  authorId?: number;
  mediaItemCode: string;
  coverFile: File | null;
  maxBytes?: number;
}): Promise<CoverUploadResult> {
  if (!input.coverFile) {
    return {
      ok: true,
      coverUrl: null,
      coverThumbUrl: null,
      thumbnailError: null,
      source: getManualCoverSource(),
    };
  }

  const validation = validateCoverFileInput({
    size: input.coverFile.size,
    type: input.coverFile.type,
    maxBytes: input.maxBytes,
  });

  if (!validation.ok) {
    return validation;
  }

  const objectKey = input.authorId
    ? buildAuthorCoverObjectKey({
        authorId: input.authorId,
        mediaItemCode: input.mediaItemCode,
        contentType: input.coverFile.type,
        uniqueId: randomUUID().slice(0, 12),
      })
    : buildAdminCoverObjectKey(input.mediaItemCode, input.coverFile.type);

  return uploadCoverBuffer({
    objectKey,
    body: Buffer.from(await input.coverFile.arrayBuffer()),
    contentType: input.coverFile.type,
    source: getManualCoverSource(),
  });
}

export async function uploadExternalCoverFromToken(input: {
  authorId?: number;
  mediaItemCode: string;
  token: string;
  maxBytes?: number;
}): Promise<CoverUploadResult> {
  const candidate = verifyCoverCandidateToken(input.token);

  if (!candidate) {
    return { ok: false, error: "cover-upload" };
  }

  const image = await fetchProviderImage({
    providerCode: candidate.provider,
    imageUrl: candidate.imageUrl,
    maxBytes: input.maxBytes ?? 5 * 1024 * 1024,
  });

  if (!image.ok) {
    if (image.error === "too-large") return { ok: false, error: "cover-too-large" };
    if (image.error === "unsupported-type") return { ok: false, error: "cover-type" };
    return { ok: false, error: "cover-upload" };
  }

  const contentType = image.contentType;
  const body = image.body;
  const validation = validateCoverFileInput({
    size: body.byteLength,
    type: contentType,
    maxBytes: input.maxBytes,
  });

  if (!validation.ok) {
    return validation;
  }

  const objectKey = input.authorId
    ? buildAuthorCoverObjectKey({
        authorId: input.authorId,
        mediaItemCode: input.mediaItemCode,
        contentType,
        uniqueId: randomUUID().slice(0, 12),
      })
    : buildAdminCoverObjectKey(input.mediaItemCode, contentType);

  return uploadCoverBuffer({
    objectKey,
    body,
    contentType,
    source: {
      provider: candidate.provider,
      externalId: candidate.id,
      pageUrl: candidate.sourcePageUrl,
    },
  });
}

export async function resolveCoverUpload(input: {
  authorId?: number;
  mediaItemCode: string;
  coverFile: File | null;
  candidateToken: string | null;
  maxBytes?: number;
}): Promise<CoverUploadResult> {
  if (input.coverFile) {
    return uploadManualCover(input);
  }

  if (input.candidateToken) {
    return uploadExternalCoverFromToken({
      authorId: input.authorId,
      mediaItemCode: input.mediaItemCode,
      token: input.candidateToken,
      maxBytes: input.maxBytes,
    });
  }

  return {
    ok: true,
    coverUrl: null,
    coverThumbUrl: null,
    thumbnailError: null,
    source: getManualCoverSource(),
  };
}
