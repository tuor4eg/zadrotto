import { creatorDisplayNameSql, creatorNameSearchSql } from "./creator-display";
import { and, asc, eq, ne, inArray } from "drizzle-orm";
import { db } from "@/db";
import { creators, creatorTypes } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";

export function creatorRelationCandidatesQuery(query: string, excludeId?: number) {
  return db.select({ id: creators.id, name: creatorDisplayNameSql(), typeCode: creatorTypes.code })
    .from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId))
    .where(and(inArray(creatorTypes.code, ["person", "collective"]),
      excludeId ? ne(creators.id, excludeId) : undefined,
      creatorNameSearchSql(query)))
    .orderBy(asc(creatorDisplayNameSql()), asc(creators.id)).limit(21);
}

export async function findCreatorRelationCandidates(query: string, excludeId?: number) {
  const normalized = normalizeSearchText(query);
  if (normalized.length < 3 || normalized.length > 200) return { items: [], hasMore: false };
  const rows = await creatorRelationCandidatesQuery(normalized, excludeId);
  return { items: rows.slice(0, 20), hasMore: rows.length > 20 };
}
