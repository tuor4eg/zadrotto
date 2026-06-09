import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { mediaCarrierMediaTypes, mediaItems, mediaTypes } from "@/db/schema";
import type { MediaTypeFormInput } from "@/lib/forms/media-type";
import type { MediaTypeOption } from "@/lib/media/types";

const mediaItemsCountSql = sql<number>`count(distinct ${mediaItems.id})::int`;
const mediaCarriersCountSql = sql<number>`count(distinct ${mediaCarrierMediaTypes.mediaCarrierId})::int`;
const otherMediaTypeLastSql = sql`case when ${mediaTypes.code} = 'other' then 1 else 0 end`;

export async function getMediaTypeOptions(): Promise<MediaTypeOption[]> {
  return db
    .select({
      code: mediaTypes.code,
      name: mediaTypes.name,
      description: mediaTypes.description,
    })
    .from(mediaTypes)
    .leftJoin(mediaItems, eq(mediaItems.mediaType, mediaTypes.code))
    .groupBy(
      mediaTypes.code,
      mediaTypes.name,
      mediaTypes.description,
    )
    .orderBy(otherMediaTypeLastSql, desc(mediaItemsCountSql), asc(mediaTypes.name));
}

export async function getAdminMediaTypes() {
  return db
    .select({
      id: mediaTypes.id,
      code: mediaTypes.code,
      name: mediaTypes.name,
      description: mediaTypes.description,
      mediaItemsCount: mediaItemsCountSql,
      mediaCarriersCount: mediaCarriersCountSql,
    })
    .from(mediaTypes)
    .leftJoin(mediaItems, eq(mediaItems.mediaType, mediaTypes.code))
    .leftJoin(mediaCarrierMediaTypes, eq(mediaCarrierMediaTypes.mediaType, mediaTypes.code))
    .groupBy(
      mediaTypes.id,
      mediaTypes.code,
      mediaTypes.name,
      mediaTypes.description,
    )
    .orderBy(otherMediaTypeLastSql, desc(mediaItemsCountSql), asc(mediaTypes.name));
}

export async function getMediaTypeById(id: number) {
  const [mediaType] = await db
    .select({
      id: mediaTypes.id,
      code: mediaTypes.code,
      name: mediaTypes.name,
      description: mediaTypes.description,
      mediaItemsCount: mediaItemsCountSql,
      mediaCarriersCount: mediaCarriersCountSql,
    })
    .from(mediaTypes)
    .leftJoin(mediaItems, eq(mediaItems.mediaType, mediaTypes.code))
    .leftJoin(mediaCarrierMediaTypes, eq(mediaCarrierMediaTypes.mediaType, mediaTypes.code))
    .where(eq(mediaTypes.id, id))
    .groupBy(
      mediaTypes.id,
      mediaTypes.code,
      mediaTypes.name,
      mediaTypes.description,
    )
    .limit(1);

  return mediaType ?? null;
}

export async function mediaTypeExistsByCode(code: string) {
  const [mediaType] = await db
    .select({ code: mediaTypes.code })
    .from(mediaTypes)
    .where(eq(mediaTypes.code, code))
    .limit(1);

  return Boolean(mediaType);
}

export async function createMediaType(input: MediaTypeFormInput & { code: string }) {
  const [mediaType] = await db
    .insert(mediaTypes)
    .values({
      code: input.code,
      name: input.name,
      description: input.description,
    })
    .returning({
      id: mediaTypes.id,
    });

  return mediaType;
}

export async function updateMediaType(input: MediaTypeFormInput & { id: number }) {
  const [mediaType] = await db
    .update(mediaTypes)
    .set({
      name: input.name,
      description: input.description,
      updatedAt: new Date(),
    })
    .where(eq(mediaTypes.id, input.id))
    .returning({
      id: mediaTypes.id,
    });

  return mediaType ?? null;
}

export async function deleteMediaTypeIfUnused(id: number) {
  const mediaType = await getMediaTypeById(id);

  if (!mediaType) {
    return "not-found" as const;
  }

  if (mediaType.mediaItemsCount > 0 || mediaType.mediaCarriersCount > 0) {
    return "has-media" as const;
  }

  const [deletedMediaType] = await db
    .delete(mediaTypes)
    .where(eq(mediaTypes.id, id))
    .returning({
      id: mediaTypes.id,
    });

  return deletedMediaType ? "deleted" as const : "not-found" as const;
}
