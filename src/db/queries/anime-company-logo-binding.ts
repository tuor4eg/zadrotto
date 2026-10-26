import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { creators, creatorTypes, providerCreatorBindings, providerCreatorExclusions, creatorRequests, creatorLogoCandidates, gameCompanyProfiles } from "@/db/schema";
import { creatorDisplayNameSql } from "./creator-display";
import { normalizeSearchText } from "@/lib/search/normalize";
import { animeCompanySearchDescriptor, exactAnimeCompanyCandidates, parseAnimeCompanySearch, type CompanySearchCandidate } from "@/lib/creators/anime-company-logo-search";
import { creatorProfileDescriptor } from "@/lib/providers/creator-profile-targets";
import { snapshotHash, type SnapshotReference } from "@/lib/providers/snapshot-values";
import { lockProviderSnapshotReferences } from "./provider-snapshots";
import { canWriteCreatorImage } from "@/lib/creators/image-policy";
export { rejectAnimeCompanyLogoCandidate, repairLegacyAnimeCompanyLogoIgnore } from "./creator-requests";

export type AnimeCompanyLogoEvidence = { creatorId: number; anilistBindingId: number; searchRef: SnapshotReference; profileRef: SnapshotReference };
export function animeCompanyLogoCreatorQuery(creatorId: number, executor: DbTransaction | typeof db = db) {
  return executor.select({ creator: creators, typeCode: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, creatorId));
}
export function animeCompanyLogoBindingsQuery(creatorId: number, executor: DbTransaction | typeof db = db) {
  return executor.select().from(providerCreatorBindings).where(eq(providerCreatorBindings.creatorId, creatorId)).orderBy(asc(providerCreatorBindings.id));
}
export function animeCompanyLogoSourceName(creator: { originalName: string | null; name: string }) { return creator.originalName?.trim() || creator.name.trim(); }

export function getAnimeCompanyLogoCandidates(requestId: number, executor: DbTransaction | typeof db = db) {
  return executor.select({ requestId: creatorLogoCandidates.requestId, creatorId: creatorLogoCandidates.creatorId,
    anilistStudioId: creatorLogoCandidates.anilistStudioId, decision: creatorLogoCandidates.decision,
    creatorName: creatorDisplayNameSql() }).from(creatorLogoCandidates).innerJoin(creators, eq(creators.id, creatorLogoCandidates.creatorId))
    .where(eq(creatorLogoCandidates.requestId, requestId)).orderBy(asc(creatorLogoCandidates.creatorId));
}

export async function animeCompanyLogoSourceAllowed(source: { externalCreatorId: string; externalCreatorName: string | null }, query: string, executor: DbTransaction | typeof db = db) {
  const requests = await executor.select({ id: creatorRequests.id }).from(creatorRequests).where(and(eq(creatorRequests.provider, "anilist"), eq(creatorRequests.externalCreatorId, source.externalCreatorId), sql`(${creatorRequests.decision}='exclude' or (${creatorRequests.manuallyReopened} and ${creatorRequests.decision} is null))`)).limit(1);
  if (requests.length) return false;
  const exclusions = await executor.select({ id: providerCreatorExclusions.id }).from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, "anilist"), sql`(${providerCreatorExclusions.externalCreatorId}=${source.externalCreatorId} or (${providerCreatorExclusions.externalCreatorId} is null and ${providerCreatorExclusions.mediaType}='anime' and ${inArray(providerCreatorExclusions.normalizedExternalCreatorName, [normalizeSearchText(source.externalCreatorName ?? query), normalizeSearchText(query)])}))`)).limit(1);
  return exclusions.length === 0;
}

/** Request is locked by the standard resolver first. HTTP never runs in this transaction. */
export async function validateAnimeCompanyLogoEvidence(tx: DbTransaction, request: typeof creatorRequests.$inferSelect, evidence: AnimeCompanyLogoEvidence) {
  if (request.provider !== "tmdb" || request.mediaType !== "anime" || !/^company:[1-9]\d*$/.test(request.externalCreatorId ?? "") || request.manuallyReopened || request.decision !== null || request.applyStatus !== "pending") return false;
  const [candidate] = await tx.select().from(creatorLogoCandidates).where(and(eq(creatorLogoCandidates.requestId, request.id), eq(creatorLogoCandidates.creatorId, evidence.creatorId)));
  if (!candidate || candidate.decision !== null) return false;
  const [row] = await animeCompanyLogoCreatorQuery(evidence.creatorId, tx).for("update", { of: creators });
  if (!row || row.typeCode !== "organization" || !canWriteCreatorImage(row.creator)) return false;
  const bindings = await animeCompanyLogoBindingsQuery(evidence.creatorId, tx).for("share");
  const source = bindings.find(binding => binding.id === evidence.anilistBindingId && binding.active && binding.provider === "anilist" && /^studio:[1-9]\d*$/.test(binding.externalCreatorId));
  if (!source || source.externalCreatorId !== candidate.anilistStudioId || bindings.filter(binding => binding.active && binding.provider === "anilist" && binding.externalCreatorId.startsWith("studio:")).length !== 1 || bindings.some(binding => binding.provider === "tmdb" && binding.externalCreatorId.startsWith("company:"))) return false;
  const historical = await tx.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "tmdb"), eq(providerCreatorBindings.externalCreatorId, request.externalCreatorId!))).limit(1);
  if (historical.length) return false;
  const reopened = await tx.select({ id: creatorRequests.id }).from(creatorRequests).where(and(eq(creatorRequests.provider, "anilist"), eq(creatorRequests.externalCreatorId, source.externalCreatorId), sql`(${creatorRequests.decision}='exclude' or (${creatorRequests.manuallyReopened} and ${creatorRequests.decision} is null))`)).limit(1);
  if (reopened.length) return false;
  const snapshots = await lockProviderSnapshotReferences(tx, [evidence.searchRef, evidence.profileRef]);
  const search = snapshots.find(row => row.id === evidence.searchRef.id)!;
  const profile = snapshots.find(row => row.id === evidence.profileRef.id)!;
  if (snapshotHash(search.payload) !== search.payloadHash || snapshotHash(profile.payload) !== profile.payloadHash) return false;
  const query = animeCompanyLogoSourceName(row.creator);
  const expectedSearch = animeCompanySearchDescriptor(source.externalCreatorId.slice(7), query);
  const expectedProfile = creatorProfileDescriptor({ provider: "tmdb", resourceType: "company", externalId: request.externalCreatorId!.slice(8) });
  const matches = (snapshot: typeof search, descriptor: typeof expectedSearch) => snapshot.providerCode === descriptor.providerCode && snapshot.resourceType === descriptor.resourceType && snapshot.externalId === descriptor.externalId && snapshot.apiMethod === descriptor.apiMethod && snapshot.requestKey === snapshotHash(descriptor.requestParams) && snapshotHash(snapshot.requestParams) === snapshotHash(descriptor.requestParams);
  if (!matches(search, expectedSearch) || !matches(profile, expectedProfile)) return false;
  const payload = parseAnimeCompanySearch(search.payload);
  const exact = exactAnimeCompanyCandidates(payload);
  const p = profile.payload as { id?: unknown; name?: unknown };
  if (payload.query !== query || exact.length !== 1 || String(exact[0].id) !== expectedProfile.externalId || String(p.id) !== expectedProfile.externalId || typeof p.name !== "string" || normalizeSearchText(p.name) !== normalizeSearchText(query) || normalizeSearchText(request.externalCreatorName) !== normalizeSearchText(query)) return false;
  const names = [normalizeSearchText(query), request.normalizedExternalCreatorName];
  const exclusions = await tx.select({ id: providerCreatorExclusions.id }).from(providerCreatorExclusions).where(sql`(
    (${providerCreatorExclusions.provider}='tmdb' and (${providerCreatorExclusions.externalCreatorId}=${request.externalCreatorId} or (${providerCreatorExclusions.externalCreatorId} is null and ${providerCreatorExclusions.mediaType}='anime' and ${inArray(providerCreatorExclusions.normalizedExternalCreatorName, names)})))
    or (${providerCreatorExclusions.provider}='anilist' and (${providerCreatorExclusions.externalCreatorId}=${source.externalCreatorId} or (${providerCreatorExclusions.externalCreatorId} is null and ${providerCreatorExclusions.mediaType}='anime' and ${inArray(providerCreatorExclusions.normalizedExternalCreatorName, [normalizeSearchText(source.externalCreatorName ?? query), normalizeSearchText(query)])})))
  )`).limit(1);
  return exclusions.length === 0;
}

/** Durable candidates, without fabricated anime occurrences or participation sources. */
export async function registerAnimeCompanyLogoCandidates(tx: DbTransaction, creatorId: number, searchCandidates: CompanySearchCandidate[], searchRef: SnapshotReference, studioId: string) {
  const candidates = searchCandidates.filter(candidate => Boolean(candidate.logo_path?.trim()));
  if (!candidates.length) return [];
  const ids = candidates.map(row => `company:${row.id}`);
  await tx.insert(creatorRequests).values(candidates.map(row => ({ provider: "tmdb", mediaType: "anime", externalCreatorId: `company:${row.id}`, externalCreatorName: row.name, normalizedExternalCreatorName: normalizeSearchText(row.name) }))).onConflictDoNothing();
  const requests = await tx.select().from(creatorRequests).where(and(eq(creatorRequests.provider, "tmdb"), inArray(creatorRequests.externalCreatorId, ids))).orderBy(asc(creatorRequests.externalCreatorId));
  // Same order as rejection/confirmation: request first, pair second. A repeated
  // search must neither reopen a rejected pair nor overwrite a confirmed decision.
  await tx.select({ id: creatorRequests.id }).from(creatorRequests).where(inArray(creatorRequests.id, requests.map(row => row.id))).orderBy(asc(creatorRequests.externalCreatorId)).for("update");
  await tx.insert(creatorLogoCandidates).values(requests.map(request => ({ requestId: request.id, creatorId, anilistStudioId: studioId }))).onConflictDoNothing();
  const pairDecisions = await tx.select({ requestId: creatorLogoCandidates.requestId, decision: creatorLogoCandidates.decision }).from(creatorLogoCandidates)
    .where(and(eq(creatorLogoCandidates.creatorId, creatorId), inArray(creatorLogoCandidates.requestId, requests.map(row => row.id))));
  const profiles = await tx.select().from(gameCompanyProfiles).where(and(eq(gameCompanyProfiles.provider, "tmdb"), inArray(gameCompanyProfiles.externalId, ids)));
  for (const row of candidates) {
    const externalId = `company:${row.id}`;
    const previous = profiles.find(profile => profile.externalId === externalId);
    const suggested = Array.isArray(previous?.details.suggestedCreatorIds) ? previous.details.suggestedCreatorIds.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0) : [];
    const details = { ...previous?.details, suggestedCreatorIds: [...new Set([...suggested, creatorId])].slice(-100), anilistStudioId: studioId, searchSnapshotId: searchRef.id, country: previous?.details.country ?? row.origin_country };
    await tx.insert(gameCompanyProfiles).values({ provider: "tmdb", externalId, name: row.name, sourceUrl: `https://www.themoviedb.org/company/${row.id}`, details, imageUrl: row.logo_path ? `https://image.tmdb.org/t/p/original${row.logo_path}` : null, imageStatus: row.logo_path ? "pending" : "missing", profileStatus: "ready", fetchedAt: new Date() })
      .onConflictDoUpdate({ target: [gameCompanyProfiles.provider, gameCompanyProfiles.externalId], set: { details, updatedAt: new Date() } });
  }
  return requests.map(request => ({ ...request, logoCandidateDecision: pairDecisions.find(pair => pair.requestId === request.id)!.decision }));
}
