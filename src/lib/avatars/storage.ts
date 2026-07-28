import { randomUUID } from "node:crypto";
import sharp from "sharp";

import {
  AVATAR_IMAGE_TYPES,
  AVATAR_MAX_BYTES,
  AVATAR_MAX_INPUT_PIXELS,
  AVATAR_OUTPUT_SIZE,
} from "@/lib/avatars/config";
import { deleteS3Object, uploadS3Object } from "@/lib/services/minio";

export type AvatarCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AvatarUploadError =
  | "avatar-crop"
  | "avatar-image"
  | "avatar-too-large"
  | "avatar-upload";

export function buildAuthorAvatarObjectKey(authorId: number) {
  return `avatars/authors/${authorId}/${randomUUID()}.webp`;
}

export function isAuthorAvatarObjectKey(objectKey: string | null) {
  return Boolean(
    objectKey
    && /^avatars\/authors\/[1-9]\d*\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(objectKey),
  );
}

export function parseAvatarCrop(input: {
  x: FormDataEntryValue | null;
  y: FormDataEntryValue | null;
  width: FormDataEntryValue | null;
  height: FormDataEntryValue | null;
}): AvatarCrop | null {
  const values = [input.x, input.y, input.width, input.height].map((value) =>
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN,
  );

  if (!values.every(Number.isInteger)) return null;
  const [x, y, width, height] = values;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || width !== height) return null;

  return { x, y, width, height };
}

function getRotatedDimensions(metadata: sharp.Metadata) {
  if (!metadata.width || !metadata.height) return null;
  const swapsAxes = metadata.orientation && metadata.orientation >= 5 && metadata.orientation <= 8;
  return swapsAxes
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}

export async function transformAuthorAvatar(input: {
  file: File;
  crop: AvatarCrop;
}): Promise<{ ok: true; body: Buffer } | { ok: false; error: AvatarUploadError }> {
  if (input.file.size <= 0 || input.file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "avatar-too-large" };
  }
  if (!AVATAR_IMAGE_TYPES.some((type) => type === input.file.type)) {
    return { ok: false, error: "avatar-image" };
  }

  try {
    const source = Buffer.from(await input.file.arrayBuffer());
    const image = sharp(source, {
      animated: false,
      limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
      pages: 1,
    });
    const metadata = await image.metadata();
    const dimensions = getRotatedDimensions(metadata);

    if (!dimensions || (metadata.pages ?? 1) !== 1) {
      return { ok: false, error: "avatar-image" };
    }

    const { x, y, width, height } = input.crop;
    if (x + width > dimensions.width || y + height > dimensions.height) {
      return { ok: false, error: "avatar-crop" };
    }

    const body = await sharp(source, {
      animated: false,
      limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
      pages: 1,
    })
      .rotate()
      .extract({ left: x, top: y, width, height })
      .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: "fill" })
      .webp({ quality: 84 })
      .toBuffer();

    return { ok: true, body };
  } catch {
    return { ok: false, error: "avatar-image" };
  }
}

export async function uploadAuthorAvatar(input: {
  authorId: number;
  file: File;
  crop: AvatarCrop;
}) {
  const transformed = await transformAuthorAvatar(input);
  if (!transformed.ok) return transformed;

  const objectKey = buildAuthorAvatarObjectKey(input.authorId);
  try {
    await uploadS3Object({
      objectKey,
      body: transformed.body,
      contentType: "image/webp",
    });
    return { ok: true as const, objectKey };
  } catch {
    return { ok: false as const, error: "avatar-upload" as const };
  }
}

export async function deleteAuthorAvatar(objectKey: string | null) {
  if (!isAuthorAvatarObjectKey(objectKey)) return;
  await deleteS3Object({ objectKey: objectKey! });
}

export async function deleteAuthorAvatarBestEffort(objectKey: string | null) {
  try {
    await deleteAuthorAvatar(objectKey);
  } catch (error) {
    console.error("Не удалось удалить файл аватара.", error);
  }
}
