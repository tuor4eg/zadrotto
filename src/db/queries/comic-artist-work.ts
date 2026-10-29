import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { creatorRoles, entryCreatorSources, mediaItemMetadata, providerCreatorBindings } from "@/db/schema";

/** Match facts to confirmed, active Comic Vine participation on this entry. */
export async function getComicArtistWork(entryId: number) {
  const [metadata] = await db.select({ sourceProvider: mediaItemMetadata.sourceProvider, facts: mediaItemMetadata.facts })
    .from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, entryId));
  if (metadata?.sourceProvider !== "comic-vine" || !Array.isArray(metadata.facts.comicVineArtistWork)) return [];
  const bindings = await db.select({ creatorId: entryCreatorSources.creatorId, externalId: providerCreatorBindings.externalCreatorId })
    .from(entryCreatorSources)
    .innerJoin(providerCreatorBindings, eq(providerCreatorBindings.id, entryCreatorSources.bindingId))
    .innerJoin(creatorRoles, eq(creatorRoles.id, entryCreatorSources.roleId))
    .where(and(eq(entryCreatorSources.entryId, entryId), eq(entryCreatorSources.provider, "comic-vine"), eq(creatorRoles.code, "artist"), eq(providerCreatorBindings.provider, "comic-vine"), eq(providerCreatorBindings.active, true)));
  const workById = new Map<string, Set<string>>();
  for (const value of metadata.facts.comicVineArtistWork) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as { externalId?: unknown; work?: unknown };
    if (typeof row.externalId !== "string" || !Array.isArray(row.work)) continue;
    const work = workById.get(row.externalId) ?? new Set<string>();
    for (const item of row.work) if (typeof item === "string") work.add(item);
    workById.set(row.externalId, work);
  }
  const creators = new Map<number, Set<string>>();
  for (const binding of bindings) {
    const work = workById.get(binding.externalId);
    if (!work) continue;
    const collected = creators.get(binding.creatorId) ?? new Set<string>();
    for (const value of work) collected.add(value);
    creators.set(binding.creatorId, collected);
  }
  return [...creators].map(([creatorId, work]) => ({ creatorId, work: [...work] }));
}
