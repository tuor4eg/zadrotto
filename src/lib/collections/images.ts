import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { deleteS3Object, uploadS3Object } from "@/lib/services/minio";

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function isCollectionImageObjectKey(value: string | null) {
  return Boolean(value && /^collections\/[0-9a-f-]{36}\.webp$/.test(value));
}

export function resolveCollectionImageUrl(value: string | null) {
  return isCollectionImageObjectKey(value)
    ? `/collection-images/${value!.split("/").map(encodeURIComponent).join("/")}`
    : null;
}

export async function uploadCollectionImage(file: File) {
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return { ok: false as const, error: "image-too-large" };
  }
  if (!IMAGE_TYPES.includes(file.type)) {
    return { ok: false as const, error: "image-invalid" };
  }
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const body = await sharp(source, { animated: false, limitInputPixels: 40_000_000, pages: 1 })
      .rotate()
      .resize(1600, 900, { fit: "cover", position: "centre" })
      .webp({ quality: 84 })
      .toBuffer();
    const objectKey = `collections/${randomUUID()}.webp`;
    await uploadS3Object({ body, contentType: "image/webp", objectKey });
    return { ok: true as const, objectKey };
  } catch {
    return { ok: false as const, error: "image-invalid" };
  }
}

export async function deleteCollectionImageBestEffort(value: string | null) {
  if (!isCollectionImageObjectKey(value)) return;
  try {
    await deleteS3Object({ objectKey: value! });
  } catch (error) {
    console.error("Не удалось удалить обложку подборки.", error);
  }
}
