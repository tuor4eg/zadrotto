import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { mediaItems, mediaTypes } from "@/db/schema";
import { fetchS3Object, uploadS3Object } from "@/lib/services/minio";
import { fetchProviderImage } from "@/lib/covers/provider-image-relay";
import { isCoverProviderCode } from "@/lib/covers/types";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";

const MAX_POSTER_BYTES = 10 * 1024 * 1024;

/** The source is always resolved from the database, never from a request URL. */
export async function readQuizPoster(mediaItemId: number) {
  const [item] = await db.select({ coverUrl: mediaItems.coverUrl, provider: mediaItems.coverSourceProvider })
    .from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .where(and(eq(mediaItems.id, mediaItemId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true))).limit(1);
  if (!item?.coverUrl) throw new Error("poster-missing");
  let body: Buffer;
  if (/^https?:\/\//i.test(item.coverUrl)) {
    if (!item.provider || !isCoverProviderCode(item.provider)) throw new Error("poster-source");
    const result = await fetchProviderImage({ providerCode: item.provider, imageUrl: item.coverUrl, maxBytes: MAX_POSTER_BYTES });
    if (!result.ok) throw new Error("poster-source");
    body = result.body;
  } else {
    const response = await fetchS3Object({ objectKey: item.coverUrl });
    if (!response?.body) throw new Error("poster-source");
    const chunks: Uint8Array[] = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > MAX_POSTER_BYTES) { await reader.cancel(); throw new Error("poster-source"); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    body = Buffer.concat(chunks);
  }
  try {
    return await sharp(body, { animated: false, pages: 1, limitInputPixels: 40_000_000 })
      .rotate().resize(1200, 1800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
  } catch { throw new Error("poster-source"); }
}

export async function snapshotQuizPoster(mediaItemId: number) {
  const body = await readQuizPoster(mediaItemId);
  const objectKey = `quizzes/${randomUUID()}.webp`;
  await uploadS3Object({ objectKey, body, contentType: "image/webp" });
  return objectKey;
}
