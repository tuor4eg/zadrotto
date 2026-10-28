import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DbTransaction } from "@/db/transaction";
import { mediaItems, mediaItemMetadata, mediaItemGenres, genreRequestMediaItems, genreRequests,
  creatorRequestMediaItems, creatorRequests, creatorRoles, entryCreatorSources, entryCreators,
  providerCreatorBindings, providerCreatorExclusions, jobRuns } from "@/db/schema";
import { extractExternalGenres } from "@/lib/media/genres";
import { extractBggCreatorReferences } from "@/lib/media/creators";
import { normalizeSearchText } from "@/lib/search/normalize";
import { BGG_FACT_KEYS, BGG_LEGACY_FACT_KEYS } from "@/lib/providers/bgg-adapter";
import { prepareBggSnapshotReferences } from "@/lib/providers/bgg-service";
import { snapshotHash, type SnapshotReference } from "@/lib/providers/snapshot-values";
import type { JSONValue } from "@/lib/providers/types";
import { resolveProviderGenres } from "./media-item-genres";
import { attachProviderSnapshots, lockProviderSnapshotReferences, withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";

export class BggSnapshotDifferenceError extends Error {
  constructor(public readonly diagnostics: string[]) { super("BGG_SNAPSHOT_DIFFERENCE"); }
}
function sameSet(left: readonly (string | number)[], right: readonly (string | number)[]) {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}
function comparableFact(value: unknown): JSONValue {
  if (value == null || value === "" || Array.isArray(value) && !value.length) return null;
  if (Array.isArray(value) && value.every(row => typeof row === "string")) return [...new Set(value.map(normalizeSearchText))].sort();
  return typeof value === "string" ? normalizeSearchText(value) : value as JSONValue;
}

export async function compareBggSnapshotState(tx: Pick<DbTransaction,"select">, id: number, facts: Record<string,unknown>,
  projection: Awaited<ReturnType<typeof prepareBggSnapshotReferences>>["projection"]) {
  const diagnostics: string[] = [];
  const externalGenres = extractExternalGenres(projection.genreFacts);
  if (facts.bggSnapshotProcessed !== true) {
    const legacyGenres = extractExternalGenres(facts);
    if (!sameSet(legacyGenres.map(row => row.normalizedName),externalGenres.map(row => row.normalizedName)) ||
      legacyGenres.some(row => row.id !== null && externalGenres.find(value => value.normalizedName === row.normalizedName)?.id !== row.id)) diagnostics.push("genres-differ");
    const legacyCreators = extractBggCreatorReferences(facts);
    if (legacyCreators && !sameSet(legacyCreators.map(row => `${row.externalId}:${row.roleCode}`),projection.creatorReferences.map(row => `${row.externalId}:${row.roleCode}`))) diagnostics.push("creators-differ");
    if (!projection.creatorReferences.length && [facts.authors,facts.artists].some(value => Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim())) diagnostics.push("creators-differ");
  }
  if (BGG_FACT_KEYS.some(key => snapshotHash(comparableFact(facts[key])) !== snapshotHash(comparableFact(projection.facts[key])))) diagnostics.push("facts-differ");
  const resolution = await resolveProviderGenres({facts:projection.genreFacts,provider:"bgg",mediaType:"boardgame"},tx);
  const links = await tx.select({id:mediaItemGenres.genreId,provider:mediaItemGenres.provider,manual:mediaItemGenres.isManual})
    .from(mediaItemGenres).where(eq(mediaItemGenres.mediaItemId,id));
  const manualGenres = new Set(links.filter(row => row.manual).map(row => row.id));
  if (!sameSet(links.filter(row => !row.manual).map(row => `${row.provider}:${row.id}`),
    resolution.genres.filter(row => !manualGenres.has(row.id)).map(row => `bgg:${row.id}`))) diagnostics.push("genre-links-differ");
  if (resolution.unmapped.length) {
    const occurrences = await tx.select({name:genreRequests.normalizedExternalGenreName}).from(genreRequestMediaItems)
      .innerJoin(genreRequests,eq(genreRequests.id,genreRequestMediaItems.requestId))
      .where(and(eq(genreRequestMediaItems.mediaItemId,id),eq(genreRequests.provider,"bgg"),eq(genreRequests.mediaType,"boardgame")));
    if (resolution.unmapped.some(row => !occurrences.some(value => value.name === row.normalizedName))) diagnostics.push("unverified-genres");
  }
  // Occurrences preserve IDs/roles even for pending or excluded authors. Localized display
  // names are deliberately not used to decide whether an identity already exists.
  const occurrences = await tx.select({externalId:creatorRequests.externalCreatorId,role:creatorRoles.code,
    decision:creatorRequests.decision,reopened:creatorRequests.manuallyReopened})
    .from(creatorRequestMediaItems).innerJoin(creatorRequests,eq(creatorRequests.id,creatorRequestMediaItems.requestId))
    .innerJoin(creatorRoles,eq(creatorRoles.id,creatorRequestMediaItems.roleId))
    .where(and(eq(creatorRequestMediaItems.mediaItemId,id),eq(creatorRequests.provider,"bgg"),eq(creatorRequests.mediaType,"boardgame")));
  if (!sameSet(occurrences.map(row => `${row.externalId}:${row.role}`),projection.creatorReferences.map(row => `${row.externalId}:${row.roleCode}`))) diagnostics.push("creators-differ");
  const ids = [...new Set(projection.creatorReferences.map(row => row.externalId))];
  const bindings = ids.length ? await tx.select().from(providerCreatorBindings)
    .where(and(eq(providerCreatorBindings.provider,"bgg"),inArray(providerCreatorBindings.externalCreatorId,ids),eq(providerCreatorBindings.active,true))) : [];
  const exclusions = ids.length ? await tx.select({externalId:providerCreatorExclusions.externalCreatorId}).from(providerCreatorExclusions)
    .where(and(eq(providerCreatorExclusions.provider,"bgg"),inArray(providerCreatorExclusions.externalCreatorId,ids))) : [];
  const manual = await tx.select({creatorId:entryCreators.creatorId,role:creatorRoles.code}).from(entryCreators)
    .innerJoin(creatorRoles,eq(creatorRoles.id,entryCreators.roleId))
    .where(and(eq(entryCreators.entryId,id),eq(entryCreators.isManual,true),inArray(creatorRoles.code,["designer","artist"])));
  const isManual = (creatorId: number, role: string) => manual.some(row => row.creatorId === creatorId && row.role === role);
  const expected = projection.creatorReferences.flatMap(ref => {
    const occurrence = occurrences.find(row => row.externalId === ref.externalId && row.role === ref.roleCode);
    const binding = bindings.find(row => row.externalCreatorId === ref.externalId);
    if (!binding || exclusions.some(row => row.externalId === ref.externalId) || occurrence?.decision === "exclude" || occurrence?.reopened && occurrence.decision === null || isManual(binding.creatorId,ref.roleCode)) return [];
    return [`${binding.creatorId}:${ref.roleCode}:${ref.externalId}`];
  });
  const sources = await tx.select({creatorId:entryCreatorSources.creatorId,role:creatorRoles.code,externalId:providerCreatorBindings.externalCreatorId})
    .from(entryCreatorSources).innerJoin(creatorRoles,eq(creatorRoles.id,entryCreatorSources.roleId))
    .leftJoin(providerCreatorBindings,eq(providerCreatorBindings.id,entryCreatorSources.bindingId))
    .where(and(eq(entryCreatorSources.entryId,id),eq(entryCreatorSources.provider,"bgg")));
  if (!sameSet(expected,sources.filter(row => !isManual(row.creatorId,row.role)).map(row => `${row.creatorId}:${row.role}:${row.externalId}`))) diagnostics.push("creator-links-differ");
  return [...new Set(diagnostics)];
}

/** A checked transfer never rewrites existing participation, moderation or queued work. */
export async function transferBggSnapshot(input: {
  mediaItemId:number; externalId:string; refs:SnapshotReference[];
  expectedSource:{provider:string|null;externalId:string|null}; jobGuard?:SnapshotJobGuard; checkpoint?:Record<string,unknown>;
}) {
  const result = await withSnapshotJobGuard(input.jobGuard,async tx => {
    const [item] = await tx.select({mediaType:mediaItems.mediaType}).from(mediaItems).where(eq(mediaItems.id,input.mediaItemId)).for("update");
    const [metadata] = await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId,input.mediaItemId));
    if (!item || item.mediaType !== "boardgame" || !metadata || metadata.sourceProvider !== "bgg" || metadata.sourceExternalId !== input.externalId ||
      metadata.sourceProvider !== input.expectedSource.provider || metadata.sourceExternalId !== input.expectedSource.externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
    await lockProviderSnapshotReferences(tx,input.refs);
    const bundle = await prepareBggSnapshotReferences(input.externalId,input.refs,tx);
    const diagnostics = await compareBggSnapshotState(tx,input.mediaItemId,metadata.facts,bundle.projection);
    await attachProviderSnapshots(tx,{entityType:"media-item",entityId:String(input.mediaItemId)},[
      {id:bundle.primary.id,payloadHash:bundle.primary.payloadHash,purpose:"primary"},
    ],{kind:"system"});
    if (diagnostics.length) return {diagnostics};
    const facts:Record<string,unknown> = {...metadata.facts};
    for (const key of [...BGG_LEGACY_FACT_KEYS,...BGG_FACT_KEYS]) delete facts[key];
    Object.assign(facts,bundle.projection.facts,{bggSnapshotProcessed:true,bggSnapshotHash:bundle.primary.payloadHash});
    if (snapshotHash(facts as JSONValue) !== snapshotHash(metadata.facts as JSONValue)) await tx.update(mediaItemMetadata)
      .set({facts,updatedAt:new Date()}).where(eq(mediaItemMetadata.mediaItemId,input.mediaItemId));
    if (input.jobGuard && input.checkpoint) await tx.update(jobRuns).set({payload:input.checkpoint,updatedAt:new Date()}).where(eq(jobRuns.id,input.jobGuard.runId));
    return {diagnostics};
  });
  if (result.diagnostics.length) throw new BggSnapshotDifferenceError(result.diagnostics);
  return result;
}
