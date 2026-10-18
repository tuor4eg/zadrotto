import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { AVATAR_MAX_BYTES, AVATAR_MAX_INPUT_PIXELS, AVATAR_OUTPUT_SIZE } from "@/lib/avatars/config";
import { transformAuthorAvatar, type AvatarCrop } from "@/lib/avatars/storage";
import { deleteS3Object, uploadS3Object } from "@/lib/services/minio";

export function isCreatorAvatarObjectKey(key: string | null): key is string {
  return Boolean(key && /^avatars\/creators\/[1-9]\d*\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(key));
}

export { resolveCreatorAvatarUrl } from "./avatar-url";

async function store(creatorId: number, body: Buffer) {
  if (!Number.isSafeInteger(creatorId) || creatorId < 1) throw new Error("invalid-creator");
  const objectKey = `avatars/creators/${creatorId}/${randomUUID()}.webp`;
  try { await uploadS3Object({ objectKey, body, contentType: "image/webp" }); }
  catch (error) {
    // A failed response can still follow a successful remote write.
    await deleteCreatorAvatarBestEffort(objectKey);
    throw error;
  }
  return { objectKey, contentHash: createHash("sha256").update(body).digest("hex") };
}

export async function transformCreatorAvatarBuffer(buffer: Buffer) {
  if (!buffer.length || buffer.length > AVATAR_MAX_BYTES) throw new Error("avatar-too-large");
  const options = { animated: false, limitInputPixels: AVATAR_MAX_INPUT_PIXELS, pages: 1 };
  const metadata = await sharp(buffer, options).metadata();
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("avatar-image");
  return sharp(buffer, options).rotate().resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: "cover" }).webp({ quality: 84 }).toBuffer();
}

export async function uploadCreatorAvatarBuffer(input: { creatorId: number; buffer: Buffer }) {
  return store(input.creatorId, await transformCreatorAvatarBuffer(input.buffer));
}

export async function uploadProcessedCreatorAvatarBuffer(input: { creatorId: number; body: Buffer }) {
  return store(input.creatorId, input.body);
}

export async function uploadCreatorAvatar(input: { creatorId: number; file: File; crop: AvatarCrop }) {
  const transformed = await transformAuthorAvatar(input);
  if (!transformed.ok) return transformed;
  try { return { ok: true as const, ...await store(input.creatorId, transformed.body) }; }
  catch { return { ok: false as const, error: "avatar-upload" as const }; }
}

export async function deleteCreatorAvatarBestEffort(objectKey: string | null) {
  if (!isCreatorAvatarObjectKey(objectKey)) return;
  try { await deleteS3Object({ objectKey }); }
  catch (error) { console.error("Не удалось удалить аватар создателя.", error); }
}
