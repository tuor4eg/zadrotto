import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { deleteS3Object, uploadS3Object } from "@/lib/services/minio";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const OUTPUT_SIZE = 512;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AchievementImageError = "image-invalid" | "image-too-large" | "image-upload";

export function buildAchievementImageObjectKey(achievementId: number) {
  return `achievements/${achievementId}/${randomUUID()}.webp`;
}

export function isAchievementImageObjectKey(objectKey: string | null) {
  return Boolean(
    objectKey
    && /^achievements\/[1-9]\d*\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(objectKey),
  );
}

export function resolveAchievementImageUrl(objectKey: string | null) {
  if (!isAchievementImageObjectKey(objectKey)) return null;
  return `/achievement-images/${objectKey!.split("/").map(encodeURIComponent).join("/")}`;
}

export async function uploadAchievementImage(input: { achievementId: number; file: File }) {
  if (input.file.size <= 0 || input.file.size > MAX_BYTES) {
    return { ok: false as const, error: "image-too-large" as const };
  }
  if (!IMAGE_TYPES.some((type) => type === input.file.type)) {
    return { ok: false as const, error: "image-invalid" as const };
  }

  let body: Buffer;
  try {
    const source = Buffer.from(await input.file.arrayBuffer());
    body = await sharp(source, { animated: false, limitInputPixels: MAX_INPUT_PIXELS, pages: 1 })
      .rotate()
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 84 })
      .toBuffer();
  } catch {
    return { ok: false as const, error: "image-invalid" as const };
  }

  const objectKey = buildAchievementImageObjectKey(input.achievementId);
  try {
    await uploadS3Object({ body, contentType: "image/webp", objectKey });
    return { ok: true as const, objectKey };
  } catch {
    return { ok: false as const, error: "image-upload" as const };
  }
}

export async function deleteAchievementImageBestEffort(objectKey: string | null) {
  if (!isAchievementImageObjectKey(objectKey)) return;
  try {
    await deleteS3Object({ objectKey: objectKey! });
  } catch (error) {
    console.error("Не удалось удалить изображение ачивки.", error);
  }
}
