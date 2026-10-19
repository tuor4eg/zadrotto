import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { AVATAR_MAX_BYTES, AVATAR_MAX_INPUT_PIXELS, AVATAR_OUTPUT_SIZE } from "@/lib/avatars/config";
import { deleteS3Object, uploadS3Object } from "@/lib/services/minio";
import { isPlatformLogoObjectKey } from "./logo-url";

export { isPlatformLogoObjectKey } from "./logo-url";

export async function transformPlatformLogo(buffer: Buffer) {
  if (!buffer.length || buffer.length > AVATAR_MAX_BYTES) throw new Error("Изображение должно быть не больше 5 МБ.");
  const options = { animated: false, limitInputPixels: AVATAR_MAX_INPUT_PIXELS, pages: 1 };
  const metadata = await sharp(buffer, options).metadata();
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Нужен PNG, JPEG или WebP без анимации.");
  return sharp(buffer, options).rotate().resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 84 }).toBuffer();
}

export async function uploadPlatformLogoBuffer(input: { platformId: number; buffer: Buffer }) {
  if (!Number.isSafeInteger(input.platformId) || input.platformId < 1) throw new Error("Некорректная платформа.");
  const body = await transformPlatformLogo(input.buffer);
  const objectKey = `logos/platforms/${input.platformId}/${randomUUID()}.webp`;
  try { await uploadS3Object({ objectKey, body, contentType: "image/webp" }); }
  catch (error) { await deletePlatformLogoBestEffort(objectKey); throw error; }
  return { objectKey, contentHash: createHash("sha256").update(body).digest("hex") };
}

export async function deletePlatformLogoBestEffort(objectKey: string | null) {
  if (!isPlatformLogoObjectKey(objectKey)) return;
  try { await deleteS3Object({ objectKey }); }
  catch (error) { console.error("Не удалось удалить логотип платформы.", error); }
}
