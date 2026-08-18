import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { deleteS3Object, uploadS3Object } from "@/lib/services/minio";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const OUTPUT_SIZE = 512;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const IMAGE_OBJECT_KEY_UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.webp";
const ACHIEVEMENT_IMAGE_OBJECT_KEY = new RegExp(
  `^achievements/[1-9]\\d*/${IMAGE_OBJECT_KEY_UUID}$`,
);
const LOCKED_ACHIEVEMENT_IMAGE_OBJECT_KEY = new RegExp(
  `^achievements/locked/${IMAGE_OBJECT_KEY_UUID}$`,
);

export type AchievementImageError = "image-invalid" | "image-too-large" | "image-upload";

export function buildAchievementImageObjectKey(achievementId: number) {
  return `achievements/${achievementId}/${randomUUID()}.webp`;
}

export function buildLockedAchievementImageObjectKey() {
  return `achievements/locked/${randomUUID()}.webp`;
}

export function isAchievementImageObjectKey(objectKey: string | null) {
  return Boolean(
    objectKey
    && (ACHIEVEMENT_IMAGE_OBJECT_KEY.test(objectKey) || LOCKED_ACHIEVEMENT_IMAGE_OBJECT_KEY.test(objectKey)),
  );
}

export function resolveAchievementImageUrl(objectKey: string | null) {
  if (!isAchievementImageObjectKey(objectKey)) return null;
  return `/achievement-images/${objectKey!.split("/").map(encodeURIComponent).join("/")}`;
}

async function processAchievementImageFile(file: File) {
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return { ok: false as const, error: "image-too-large" as const };
  }
  if (!IMAGE_TYPES.some((type) => type === file.type)) {
    return { ok: false as const, error: "image-invalid" as const };
  }

  try {
    const source = Buffer.from(await file.arrayBuffer());
    const body = await sharp(source, { animated: false, limitInputPixels: MAX_INPUT_PIXELS, pages: 1 })
      .rotate()
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 84 })
      .toBuffer();
    return { ok: true as const, body };
  } catch {
    return { ok: false as const, error: "image-invalid" as const };
  }
}

async function uploadProcessedAchievementImage(input: { body: Buffer; objectKey: string }) {
  try {
    await uploadS3Object({ body: input.body, contentType: "image/webp", objectKey: input.objectKey });
    return { ok: true as const, objectKey: input.objectKey };
  } catch {
    return { ok: false as const, error: "image-upload" as const };
  }
}

export async function uploadAchievementImage(input: { achievementId: number; file: File }) {
  const processed = await processAchievementImageFile(input.file);
  if (!processed.ok) return processed;
  return uploadProcessedAchievementImage({
    body: processed.body,
    objectKey: buildAchievementImageObjectKey(input.achievementId),
  });
}

export async function uploadLockedAchievementImage(file: File) {
  const processed = await processAchievementImageFile(file);
  if (!processed.ok) return processed;
  return uploadProcessedAchievementImage({
    body: processed.body,
    objectKey: buildLockedAchievementImageObjectKey(),
  });
}

export async function deleteAchievementImageBestEffort(objectKey: string | null) {
  if (!isAchievementImageObjectKey(objectKey)) return;
  try {
    await deleteS3Object({ objectKey: objectKey! });
  } catch (error) {
    console.error("Не удалось удалить изображение ачивки.", error);
  }
}
