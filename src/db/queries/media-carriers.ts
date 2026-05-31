import { and, asc, eq, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { mediaCarriers, mediaItems } from "@/db/schema";
import type { MediaTypeFilter } from "@/app/media-items-catalog-logic";
import type { MediaCarrierFormInput } from "@/lib/media-carrier-form";
import type { MediaType } from "@/lib/media-types";

const mediaItemsCountSql = sql<number>`count(${mediaItems.id})::int`;

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
    conditions.push(eq(mediaCarriers.mediaType, input.mediaTypeFilter));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getMediaCarrierOptions(input?: { mediaType?: MediaType }) {
  const carriers = await db
    .select({
      id: mediaCarriers.id,
      code: mediaCarriers.code,
      name: mediaCarriers.name,
      mediaType: mediaCarriers.mediaType,
      description: mediaCarriers.description,
    })
    .from(mediaCarriers)
    .where(input?.mediaType ? eq(mediaCarriers.mediaType, input.mediaType) : undefined)
    .orderBy(asc(mediaCarriers.mediaType), asc(mediaCarriers.name));

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
      mediaType: mediaCarriers.mediaType,
      description: mediaCarriers.description,
      mediaItemsCount: mediaItemsCountSql,
    })
    .from(mediaCarriers)
    .leftJoin(mediaItems, eq(mediaItems.mediaCarrierId, mediaCarriers.id))
    .where(filterCondition)
    .groupBy(
      mediaCarriers.id,
      mediaCarriers.code,
      mediaCarriers.name,
      mediaCarriers.mediaType,
      mediaCarriers.description,
    )
    .orderBy(asc(mediaCarriers.mediaType), asc(mediaCarriers.name));
}

export async function getAdminMediaCarrierTypeCounts() {
  return db
    .select({
      mediaType: mediaCarriers.mediaType,
      count: sql<number>`count(*)::int`,
    })
    .from(mediaCarriers)
    .groupBy(mediaCarriers.mediaType);
}

export async function getMediaCarrierById(id: number) {
  const [carrier] = await db
    .select({
      id: mediaCarriers.id,
      code: mediaCarriers.code,
      name: mediaCarriers.name,
      mediaType: mediaCarriers.mediaType,
      description: mediaCarriers.description,
      mediaItemsCount: mediaItemsCountSql,
    })
    .from(mediaCarriers)
    .leftJoin(mediaItems, eq(mediaItems.mediaCarrierId, mediaCarriers.id))
    .where(eq(mediaCarriers.id, id))
    .groupBy(
      mediaCarriers.id,
      mediaCarriers.code,
      mediaCarriers.name,
      mediaCarriers.mediaType,
      mediaCarriers.description,
    )
    .limit(1);

  return carrier ?? null;
}

export async function getMediaCarrierMediaTypeById(id: number) {
  const [carrier] = await db
    .select({
      mediaType: mediaCarriers.mediaType,
    })
    .from(mediaCarriers)
    .where(eq(mediaCarriers.id, id))
    .limit(1);

  return carrier?.mediaType ?? null;
}

export async function createMediaCarrier(input: MediaCarrierFormInput & { code: string }) {
  const [carrier] = await db
    .insert(mediaCarriers)
    .values({
      code: input.code,
      name: input.name,
      mediaType: input.mediaType,
      description: input.description,
    })
    .returning({
      id: mediaCarriers.id,
    });

  return carrier;
}

export async function updateMediaCarrier(input: MediaCarrierFormInput & { id: number }) {
  const [carrier] = await db
    .update(mediaCarriers)
    .set({
      name: input.name,
      mediaType: input.mediaType,
      description: input.description,
      updatedAt: new Date(),
    })
    .where(eq(mediaCarriers.id, input.id))
    .returning({
      id: mediaCarriers.id,
    });

  return carrier ?? null;
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
