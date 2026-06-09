import { and, asc, eq, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { mediaCarrierMediaTypes, mediaCarriers, mediaItems } from "@/db/schema";
import type { MediaTypeFilter } from "@/app/media-items-catalog-logic";
import type { MediaCarrierFormInput } from "@/lib/forms/media-carrier";
import type { MediaType } from "@/lib/media/types";

const mediaItemsCountSql = sql<number>`count(distinct ${mediaItems.id})::int`;
const mediaCarrierMediaTypesSql = sql<MediaType[]>`coalesce(
  array_agg(distinct ${mediaCarrierMediaTypes.mediaType} order by ${mediaCarrierMediaTypes.mediaType})
    filter (where ${mediaCarrierMediaTypes.mediaType} is not null),
  array[]::text[]
)`;

function mediaCarrierSupportsMediaTypeCondition(mediaType: MediaType) {
  return sql`exists (
    select 1
    from ${mediaCarrierMediaTypes}
    where ${mediaCarrierMediaTypes.mediaCarrierId} = ${mediaCarriers.id}
      and ${mediaCarrierMediaTypes.mediaType} = ${mediaType}
  )`;
}

function toMediaCarrierTypeRows(carrierId: number, mediaTypes: readonly MediaType[]) {
  return mediaTypes.map((mediaType) => ({
    mediaCarrierId: carrierId,
    mediaType,
  }));
}

function adminMediaCarrierFilterConditions(input: {
  mediaTypeFilter: MediaTypeFilter;
  searchQuery: string;
}) {
  const conditions: SQL[] = [];
  const normalizedSearchQuery = input.searchQuery.trim().toLowerCase();

  if (normalizedSearchQuery) {
    const pattern = `%${normalizedSearchQuery}%`;

    conditions.push(
      or(
        sql`lower(${mediaCarriers.name}) like ${pattern}`,
        sql`lower(${mediaCarriers.code}) like ${pattern}`,
        sql`lower(${mediaCarriers.description}) like ${pattern}`,
      )!,
    );
  }

  if (input.mediaTypeFilter !== "all") {
    conditions.push(mediaCarrierSupportsMediaTypeCondition(input.mediaTypeFilter));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getMediaCarrierOptions(input?: { mediaType?: MediaType }) {
  const carriers = await db
    .select({
      id: mediaCarriers.id,
      code: mediaCarriers.code,
      name: mediaCarriers.name,
      mediaTypes: mediaCarrierMediaTypesSql,
      description: mediaCarriers.description,
    })
    .from(mediaCarriers)
    .leftJoin(
      mediaCarrierMediaTypes,
      eq(mediaCarrierMediaTypes.mediaCarrierId, mediaCarriers.id),
    )
    .where(input?.mediaType ? mediaCarrierSupportsMediaTypeCondition(input.mediaType) : undefined)
    .groupBy(
      mediaCarriers.id,
      mediaCarriers.code,
      mediaCarriers.name,
      mediaCarriers.description,
    )
    .orderBy(asc(mediaCarriers.name));

  return carriers;
}

export async function getAdminMediaCarriers(input?: {
  mediaTypeFilter?: MediaTypeFilter;
  searchQuery?: string;
}) {
  const filterCondition = adminMediaCarrierFilterConditions({
    mediaTypeFilter: input?.mediaTypeFilter ?? "all",
    searchQuery: input?.searchQuery ?? "",
  });

  return db
    .select({
      id: mediaCarriers.id,
      code: mediaCarriers.code,
      name: mediaCarriers.name,
      mediaTypes: mediaCarrierMediaTypesSql,
      description: mediaCarriers.description,
      mediaItemsCount: mediaItemsCountSql,
    })
    .from(mediaCarriers)
    .leftJoin(
      mediaCarrierMediaTypes,
      eq(mediaCarrierMediaTypes.mediaCarrierId, mediaCarriers.id),
    )
    .leftJoin(mediaItems, eq(mediaItems.mediaCarrierId, mediaCarriers.id))
    .where(filterCondition)
    .groupBy(
      mediaCarriers.id,
      mediaCarriers.code,
      mediaCarriers.name,
      mediaCarriers.description,
    )
    .orderBy(asc(mediaCarriers.name));
}

export async function getAdminMediaCarrierTypeCounts() {
  return db
    .select({
      mediaType: mediaCarrierMediaTypes.mediaType,
      count: sql<number>`count(distinct ${mediaCarrierMediaTypes.mediaCarrierId})::int`,
    })
    .from(mediaCarrierMediaTypes)
    .groupBy(mediaCarrierMediaTypes.mediaType);
}

export async function getAdminMediaCarrierTotalCount() {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(mediaCarriers);

  return row?.count ?? 0;
}

export async function getMediaCarrierById(id: number) {
  const [carrier] = await db
    .select({
      id: mediaCarriers.id,
      code: mediaCarriers.code,
      name: mediaCarriers.name,
      mediaTypes: mediaCarrierMediaTypesSql,
      description: mediaCarriers.description,
      mediaItemsCount: mediaItemsCountSql,
    })
    .from(mediaCarriers)
    .leftJoin(
      mediaCarrierMediaTypes,
      eq(mediaCarrierMediaTypes.mediaCarrierId, mediaCarriers.id),
    )
    .leftJoin(mediaItems, eq(mediaItems.mediaCarrierId, mediaCarriers.id))
    .where(eq(mediaCarriers.id, id))
    .groupBy(
      mediaCarriers.id,
      mediaCarriers.code,
      mediaCarriers.name,
      mediaCarriers.description,
    )
    .limit(1);

  return carrier ?? null;
}

export async function getMediaCarrierSupportedMediaTypesById(id: number) {
  const [carrier] = await db
    .select({
      id: mediaCarriers.id,
      mediaTypes: mediaCarrierMediaTypesSql,
    })
    .from(mediaCarriers)
    .leftJoin(
      mediaCarrierMediaTypes,
      eq(mediaCarrierMediaTypes.mediaCarrierId, mediaCarriers.id),
    )
    .where(eq(mediaCarriers.id, id))
    .groupBy(mediaCarriers.id)
    .limit(1);

  return carrier?.mediaTypes ?? null;
}

export async function getMediaCarrierUsedMediaTypesById(id: number) {
  const rows = await db
    .select({
      mediaType: mediaItems.mediaType,
    })
    .from(mediaItems)
    .where(eq(mediaItems.mediaCarrierId, id))
    .groupBy(mediaItems.mediaType);

  return rows.map((row) => row.mediaType);
}

export async function createMediaCarrier(input: MediaCarrierFormInput) {
  return db.transaction(async (tx) => {
    const [carrier] = await tx
      .insert(mediaCarriers)
      .values({
        code: input.code,
        name: input.name,
        description: input.description,
      })
      .returning({
        id: mediaCarriers.id,
      });

    await tx
      .insert(mediaCarrierMediaTypes)
      .values(toMediaCarrierTypeRows(carrier.id, input.mediaTypes));

    return carrier;
  });
}

export async function updateMediaCarrier(input: MediaCarrierFormInput & { id: number }) {
  return db.transaction(async (tx) => {
    const [carrier] = await tx
      .update(mediaCarriers)
      .set({
        code: input.code,
        name: input.name,
        description: input.description,
        updatedAt: new Date(),
      })
      .where(eq(mediaCarriers.id, input.id))
      .returning({
        id: mediaCarriers.id,
      });

    if (!carrier) {
      return null;
    }

    await tx
      .delete(mediaCarrierMediaTypes)
      .where(eq(mediaCarrierMediaTypes.mediaCarrierId, input.id));

    await tx
      .insert(mediaCarrierMediaTypes)
      .values(toMediaCarrierTypeRows(input.id, input.mediaTypes));

    return carrier;
  });
}

export async function deleteMediaCarrierIfUnused(id: number) {
  const [usage] = await db
    .select({
      id: mediaCarriers.id,
      mediaItemsCount: mediaItemsCountSql,
    })
    .from(mediaCarriers)
    .leftJoin(mediaItems, eq(mediaItems.mediaCarrierId, mediaCarriers.id))
    .where(eq(mediaCarriers.id, id))
    .groupBy(mediaCarriers.id)
    .limit(1);

  if (!usage) {
    return "not-found" as const;
  }

  if (usage.mediaItemsCount > 0) {
    return "has-media-items" as const;
  }

  const [carrier] = await db
    .delete(mediaCarriers)
    .where(eq(mediaCarriers.id, id))
    .returning({
      id: mediaCarriers.id,
    });

  return carrier ? "deleted" as const : "not-found" as const;
}
