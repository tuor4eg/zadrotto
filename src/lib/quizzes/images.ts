import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { deleteS3Object, uploadS3Object } from "@/lib/services/minio";

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function isQuizImageObjectKey(value: string | null) {
  return Boolean(value && /^quizzes\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(value));
}
export function resolveQuizImageUrl(value: string | null) {
  return isQuizImageObjectKey(value) ? `/quiz-images/${value!.split("/").map(encodeURIComponent).join("/")}` : null;
}
export async function uploadQuizImage(input: { file: File }) {
  if (input.file.size <= 0 || input.file.size > MAX_BYTES) return { ok: false as const, error: "image-too-large" };
  if (!IMAGE_TYPES.includes(input.file.type)) return { ok: false as const, error: "image-invalid" };
  try {
    const source = Buffer.from(await input.file.arrayBuffer());
    const body = await sharp(source, { animated: false, limitInputPixels: 40_000_000, pages: 1 })
      .rotate().resize(1600, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    const objectKey = `quizzes/${randomUUID()}.webp`;
    await uploadS3Object({ body, contentType: "image/webp", objectKey });
    return { ok: true as const, objectKey };
  } catch { return { ok: false as const, error: "image-invalid" }; }
}
export async function deleteQuizImageBestEffort(value: string | null) {
  if (!isQuizImageObjectKey(value)) return;
  try { await deleteS3Object({ objectKey: value! }); } catch (error) { console.error("Не удалось удалить изображение квиза.", error); }
}
