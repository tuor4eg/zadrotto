import { and, eq, or, sql } from "drizzle-orm";
import type { CreatorTransaction } from "./creators";
import { db } from "@/db";
import { creators, creatorTypes, providerCreatorMappings } from "@/db/schema";
import { normalizeSearchSql } from "@/db/search";

/** Bounded indexed probes: aliases must not turn the name lookup into a correlated full scan. */
export function tmdbPersonNameCandidateQuery(normalizedName: string, executor: CreatorTransaction | typeof db = db) {
  return executor.select({ id: creators.id }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId))
    .where(and(eq(creatorTypes.code, "person"), or(
      sql`btrim(${normalizeSearchSql(creators.name)})=${normalizedName}`,
      sql`btrim(${normalizeSearchSql(creators.originalName)})=${normalizedName}`,
    ))).limit(1);
}
export function tmdbPersonAliasCandidateQuery(normalizedName: string, executor: CreatorTransaction | typeof db = db) {
  return executor.select({ id: creators.id }).from(providerCreatorMappings)
    .innerJoin(creators, eq(creators.id, providerCreatorMappings.creatorId)).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId))
    .where(and(eq(providerCreatorMappings.normalizedExternalCreatorName, normalizedName), eq(creatorTypes.code, "person"))).limit(1);
}
