import "server-only";
import { and, eq } from "drizzle-orm";
import type { DbTransaction } from "@/db/transaction";
import { mediaItems, mediaItemMetadata, gameCompanyRosters, mediaItemGenres, mediaItemPlatforms,
  genreRequestMediaItems, genreRequests, platformRequestMediaItems, platformRequests, jobRuns } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";
import { extractExternalGenres } from "@/lib/media/genres";
import { extractExternalPlatforms } from "@/lib/media/platforms";
import { extractGameCompanyReferences } from "@/lib/creators/game-companies";
import { GAME_LEGACY_FACT_KEYS, type GameSnapshotProvider } from "@/lib/providers/game-adapter";
import { prepareGameSnapshotReferences } from "@/lib/providers/game-service";
import { snapshotHash, type SnapshotReference } from "@/lib/providers/snapshot-values";
import type { JSONValue } from "@/lib/providers/types";
import { resolveProviderGenres } from "./media-item-genres";
import { resolveProviderPlatforms } from "./media-item-platforms";
import { attachProviderSnapshots, lockProviderSnapshotReferences, withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";

export class GameSnapshotDifferenceError extends Error {
  constructor(public readonly diagnostics: string[]) { super("GAME_SNAPSHOT_DIFFERENCE"); }
}

function sameSet(left: readonly (string | number)[], right: readonly (string | number)[]) {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

/** Compare imported assignments; independent manual choices never require replacement. */
function sameAssignments(rows: {id: number; provider: string | null; manual: boolean}[], ids: number[], provider: string) {
  const manual = new Set(rows.filter(row => row.manual).map(row => row.id));
  return sameSet(rows.filter(row => !row.manual).map(row => `${row.provider}:${row.id}`),
    ids.filter(id => !manual.has(id)).map(id => `${provider}:${id}`));
}

export async function compareGameSnapshotState(tx: Pick<DbTransaction, "select">, id: number, provider: GameSnapshotProvider, externalId: string,
  facts: Record<string, unknown>, projection: Awaited<ReturnType<typeof prepareGameSnapshotReferences>>["projection"]) {
  const diagnostics: string[] = [];
  const externalGenres = extractExternalGenres(projection.genreFacts);
  const externalPlatforms = extractExternalPlatforms(projection.platformFacts);
  if (facts.gameSnapshotProcessed !== true) {
    const legacyGenres = extractExternalGenres(facts);
    if (!sameSet(legacyGenres.map(row => row.normalizedName), externalGenres.map(row => row.normalizedName)) ||
      legacyGenres.some(row => row.id !== null && externalGenres.find(value => value.normalizedName === row.normalizedName)?.id !== row.id)) diagnostics.push("genres-differ");
    if (!sameSet(extractExternalPlatforms(facts).map(row => row.normalizedName), externalPlatforms.map(row => row.normalizedName))) diagnostics.push("platforms-differ");
  }
  const [roster] = await tx.select().from(gameCompanyRosters)
    .where(and(eq(gameCompanyRosters.mediaItemId, id), eq(gameCompanyRosters.provider, provider)));
  const companyKeys = (refs: typeof projection.companyReferences) => refs.map(row => `${row.externalId}:${row.roleCode}:${normalizeSearchText(row.name)}`);
  if (roster ? roster.sourceExternalId !== externalId || !sameSet(companyKeys(roster.references), companyKeys(projection.companyReferences)) : projection.companyReferences.length > 0) diagnostics.push("companies-differ");
  if (facts.gameSnapshotProcessed !== true) {
    const legacyReferences = extractGameCompanyReferences(facts, provider);
    if (legacyReferences && !sameSet(companyKeys(legacyReferences), companyKeys(projection.companyReferences))) diagnostics.push("companies-differ");
    for (const [key, role] of [["developers", "developer"], ["publishers", "publisher"]] as const) {
      if (!(key in facts)) continue;
      const value = facts[key];
      const names = value == null ? [] : typeof value === "string" ? [value] : Array.isArray(value) && value.every(row => typeof row === "string") ? value as string[] : null;
      if (!names || !sameSet(names.map(normalizeSearchText), projection.companyReferences.filter(row => row.roleCode === role).map(row => normalizeSearchText(row.name)))) diagnostics.push("companies-differ");
    }
  }
  const genreResolution = await resolveProviderGenres({facts:projection.genreFacts,provider,mediaType:"game"}, tx);
  const platformResolution = await resolveProviderPlatforms({facts:projection.platformFacts,provider,mediaType:"game"}, tx);
  const genreLinks = await tx.select({id:mediaItemGenres.genreId,provider:mediaItemGenres.provider,manual:mediaItemGenres.isManual})
    .from(mediaItemGenres).where(eq(mediaItemGenres.mediaItemId, id));
  const platformLinks = await tx.select({id:mediaItemPlatforms.platformId,provider:mediaItemPlatforms.provider,manual:mediaItemPlatforms.isManual})
    .from(mediaItemPlatforms).where(eq(mediaItemPlatforms.mediaItemId, id));
  if (!sameAssignments(genreLinks, genreResolution.genres.map(row => row.id), provider)) diagnostics.push("genre-links-differ");
  if (!sameAssignments(platformLinks, platformResolution.platforms.map(row => row.id), provider)) diagnostics.push("platform-links-differ");
  // Unknown values may already be awaiting moderation. Never create a request during transfer.
  if (genreResolution.unmapped.length) {
    const occurrences = await tx.select({name:genreRequests.normalizedExternalGenreName}).from(genreRequestMediaItems)
      .innerJoin(genreRequests, eq(genreRequests.id, genreRequestMediaItems.requestId))
      .where(and(eq(genreRequestMediaItems.mediaItemId, id), eq(genreRequests.provider, provider), eq(genreRequests.mediaType, "game")));
    if (genreResolution.unmapped.some(row => !occurrences.some(value => value.name === row.normalizedName))) diagnostics.push("unverified-genres");
  }
  if (platformResolution.unmapped.length) {
    const occurrences = await tx.select({name:platformRequests.normalizedExternalPlatformName}).from(platformRequestMediaItems)
      .innerJoin(platformRequests, eq(platformRequests.id, platformRequestMediaItems.requestId))
      .where(and(eq(platformRequestMediaItems.mediaItemId, id), eq(platformRequests.provider, provider), eq(platformRequests.mediaType, "game")));
    if (platformResolution.unmapped.some(row => !occurrences.some(value => value.name === row.normalizedName))) diagnostics.push("unverified-platforms");
  }
  return [...new Set(diagnostics)];
}

/** Transfer raw ownership without touching moderation, relations, rosters or downstream jobs. */
export async function transferGameSnapshot(input: {
  mediaItemId: number; provider: GameSnapshotProvider; externalId: string; refs: SnapshotReference[];
  expectedSource: {provider: string | null; externalId: string | null}; jobGuard?: SnapshotJobGuard;
  checkpoint?: Record<string, unknown>;
}) {
  const result = await withSnapshotJobGuard(input.jobGuard, async tx => {
    const [item] = await tx.select({mediaType:mediaItems.mediaType}).from(mediaItems).where(eq(mediaItems.id,input.mediaItemId)).for("update");
    const [metadata] = await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId,input.mediaItemId));
    if (!item || item.mediaType !== "game" || !metadata || metadata.sourceProvider !== input.provider || metadata.sourceExternalId !== input.externalId ||
      metadata.sourceProvider !== input.expectedSource.provider || metadata.sourceExternalId !== input.expectedSource.externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
    await lockProviderSnapshotReferences(tx,input.refs);
    const bundle = await prepareGameSnapshotReferences(input.provider,input.externalId,input.refs,tx);
    const diagnostics = await compareGameSnapshotState(tx,input.mediaItemId,input.provider,input.externalId,metadata.facts,bundle.projection);
    await attachProviderSnapshots(tx,{entityType:"media-item",entityId:String(input.mediaItemId)},
      [{id:bundle.primary.id,payloadHash:bundle.primary.payloadHash,purpose:"primary"}],{kind:"system"});
    if (diagnostics.length) return {diagnostics};
    const facts = {...metadata.facts,...bundle.projection.facts,gameSnapshotProcessed:true};
    for (const key of GAME_LEGACY_FACT_KEYS) delete (facts as Record<string,unknown>)[key];
    // Repeating a successful transfer is a true metadata no-op.
    if (snapshotHash(facts as JSONValue) !== snapshotHash(metadata.facts as JSONValue)) await tx.update(mediaItemMetadata)
      .set({facts,updatedAt:new Date()}).where(eq(mediaItemMetadata.mediaItemId,input.mediaItemId));
    if (input.jobGuard && input.checkpoint) await tx.update(jobRuns).set({payload:input.checkpoint,updatedAt:new Date()}).where(eq(jobRuns.id,input.jobGuard.runId));
    return {diagnostics};
  });
  // The raw link is retained for reviewing differences; working data stay unchanged.
  if (result.diagnostics.length) throw new GameSnapshotDifferenceError(result.diagnostics);
  return result;
}
