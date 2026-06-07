import { randomUUID } from "node:crypto";
import sharp from "sharp";

import {
  buildAuthorCoverObjectKey,
  getCoverFileExtension,
  validateCoverFileInput,
} from "@/lib/author-media-form";
import { deleteS3Object, fetchS3Object, uploadS3Object } from "@/lib/storage";
import { verifyCoverCandidateToken } from "@/lib/covers/candidates";
import type { CoverCandidate, CoverSourceInput } from "@/lib/covers/types";

export type CoverUploadResult =
  | {
      ok: true;
      coverUrl: string | null;
      coverThumbUrl: string | null;
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
  if (!isS3ObjectKey(coverUrl)) {
    return null;
  }

  const objectKey = coverUrl!.trim();
  const thumbObjectKey = buildCoverThumbObjectKey(objectKey);

  if (!thumbObjectKey) {
    return null;
  }

  const response = await fetchS3Object({ objectKey });

  if (!response) {
    return null;
  }

  const body = Buffer.from(await response.arrayBuffer());
  const thumbBody = await createCoverThumbBuffer(body);

  if (!thumbBody) {
    return null;
  }

  await uploadS3Object({
    objectKey: thumbObjectKey,
    body: thumbBody,
    contentType: "image/webp",
  });

  return thumbObjectKey;
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
        console.error(error);
      }
    }

    return {
      ok: true,
      coverUrl: input.objectKey,
      coverThumbUrl: uploadedThumbObjectKey,
      source: input.source,
    };
  } catch {
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

async function fetchExternalCover(candidate: CoverCandidate) {
  const response = await fetch(candidate.imageUrl, {
    headers: {
      accept: "image/jpeg,image/png,image/webp",
    },
  });

  if (!response.ok) {
    return null;
  }

  return response;
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

  const response = await fetchExternalCover(candidate);

  if (!response) {
    return { ok: false, error: "cover-upload" };
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const body = Buffer.from(await response.arrayBuffer());
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
    source: getManualCoverSource(),
  };
}
