import { creatorDisplayNameSql } from "./creator-display";
import { enqueueCreatorImageFill } from "./creator-image-jobs";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { creators, creatorTypes, creatorRoles, creatorRequests, creatorRequestMediaItems, providerCreatorBindings, providerCreatorExclusions, entryCreators, entryCreatorSources, gameCompanyProfiles, gameCompanyRosters, mediaItemMetadata } from "@/db/schema";
import { extractGameCompanyReferences, isGameCompanyProvider, type GameCompanyProvider, type GameCompanyReference } from "@/lib/creators/game-companies";
import { getStringListFact } from "@/lib/media/metadata-facts";
import { normalizeSearchText } from "@/lib/search/normalize";
import { pruneEntryCreators, type CreatorTransaction } from "./creators";
import { createJobRun } from "./jobs";
import { appendDomainEvent } from "@/lib/domain-events/persistence";

export const gameCompanyRequestKey = (provider: string, externalId: string) => and(eq(creatorRequests.provider, provider), eq(creatorRequests.externalCreatorId, externalId));

/** Caller locks the entry. Every identity request is locked before reading its binding. */
export async function syncGameCompanyCreators(tx: CreatorTransaction, mediaItemId: number, provider: GameCompanyProvider, facts: Record<string, unknown>) {
  const references = extractGameCompanyReferences(facts, provider);
  const result = { createdCreators: 0, createdMappings: 0, createdLinks: 0, newRequests: 0, usedBindings: 0 };
  if (references === null) return result;
  const roleRows = await tx.select().from(creatorRoles).where(inArray(creatorRoles.code, ["developer", "publisher"]));
  const roles = new Map(roleRows.map(row => [row.code, row.id]));
  if (references.some(ref => !roles.has(ref.roleCode))) throw new Error("Роли организаций не настроены.");
  const groups = new Map<string, GameCompanyReference[]>();
  for (const ref of references) groups.set(ref.externalId, [...(groups.get(ref.externalId) ?? []), ref]);
  const requests = [];
  for (const [externalId, refs] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const [detected] = await tx.insert(creatorRequests).values({ provider, externalCreatorId: externalId, mediaType: "game", externalCreatorName: refs[0].name, normalizedExternalCreatorName: normalizeSearchText(refs[0].name) }).onConflictDoNothing().returning();
    const [request] = await tx.select().from(creatorRequests).where(gameCompanyRequestKey(provider, externalId)).for("update");
    requests.push({ request, refs, detected: Boolean(detected) });
  }
  await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId, mediaItemId), eq(entryCreatorSources.provider, provider)));
  await tx.delete(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.mediaItemId, mediaItemId), sql`${creatorRequestMediaItems.requestId} in (select id from creator_requests where provider=${provider} and external_creator_id is not null)`));
  for (const { request, refs, detected } of requests) {
    await tx.insert(creatorRequestMediaItems).values(refs.map(ref => ({ requestId: request.id, mediaItemId, roleId: roles.get(ref.roleCode)!, externalCreatorName: ref.name }))).onConflictDoNothing();
    await tx.update(creatorRequests).set({ externalCreatorName: refs[0].name, normalizedExternalCreatorName: normalizeSearchText(refs[0].name), lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
    const [excluded] = await tx.select().from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, provider), eq(providerCreatorExclusions.externalCreatorId, request.externalCreatorId!)));
    const [binding] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, provider), eq(providerCreatorBindings.externalCreatorId, request.externalCreatorId!), eq(providerCreatorBindings.active, true)));
    const allowed = binding && !excluded && request.decision !== "exclude" && !(request.manuallyReopened && request.decision === null);
    if (allowed) {
      result.usedBindings++;
      for (const ref of refs) {
        const roleId = roles.get(ref.roleCode)!;
        const [added] = await tx.insert(entryCreators).values({ entryId: mediaItemId, creatorId: binding.creatorId, roleId }).onConflictDoNothing().returning();
        if (added) result.createdLinks++;
        await tx.insert(entryCreatorSources).values({ entryId: mediaItemId, creatorId: binding.creatorId, roleId, provider, bindingId: binding.id, normalizedExternalCreatorName: `${provider}:${ref.externalId}` }).onConflictDoNothing();
      }
    } else if (detected && !excluded) {
      result.newRequests++;
      const event = await appendDomainEvent(tx, { type: "creator-request.created", actorAuthorId: null, aggregateType: "creator-request", aggregateId: String(request.id), payload: { requestId: request.id } });
      await createJobRun({ type: "domain-events.dispatch", payload: { eventId: event.id }, source: "event", maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
    }
  }
  await pruneEntryCreators(tx, mediaItemId);
  return result;
}

export async function saveGameCompanyRoster(tx: CreatorTransaction, input: { mediaItemId: number; provider: GameCompanyProvider; sourceExternalId: string; references: GameCompanyReference[]; enqueueEnrichment?: boolean }) {
  const references = extractGameCompanyReferences({ gameCompanyReferences: input.references }, input.provider)!;
  await tx.insert(gameCompanyRosters).values({ mediaItemId: input.mediaItemId, provider: input.provider, sourceExternalId: input.sourceExternalId, references }).onConflictDoUpdate({ target: [gameCompanyRosters.mediaItemId, gameCompanyRosters.provider], set: { sourceExternalId: input.sourceExternalId, references, fetchedAt: new Date(), updatedAt: new Date() } });
  const ids = [...new Set(references.map(ref => ref.externalId))];
  for (const externalId of ids) {
    const ref = references.find(value => value.externalId === externalId)!;
    await tx.insert(gameCompanyProfiles).values({ provider: input.provider, externalId, name: ref.name, sourceUrl: ref.sourceUrl }).onConflictDoUpdate({
      target: [gameCompanyProfiles.provider, gameCompanyProfiles.externalId],
      set: { name: sql`case when ${gameCompanyProfiles.profileStatus}='ready' then ${gameCompanyProfiles.name} else ${ref.name} end`, sourceUrl: sql`coalesce(${gameCompanyProfiles.sourceUrl}, ${ref.sourceUrl ?? null})` },
    });
  }
  const result = await syncGameCompanyCreators(tx, input.mediaItemId, input.provider, { gameCompanyReferences: references });
  if (input.enqueueEnrichment !== false && ids.length) {
    await createJobRun({ type: "media.game-company-enrich", payload: { provider: input.provider, externalIds: ids }, source: "event", maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
  }
  return result;
}

/** Decision transaction holds request lock, but never entry locks. Removal is done by apply. */
export async function resolveGameCompanyRequest(tx: CreatorTransaction, request: typeof creatorRequests.$inferSelect, input: { decision: "create" | "map" | "exclude"; creatorId?: number; name?: string }) {
  if ((!isGameCompanyProvider(request.provider) && request.provider !== "tmdb") || !request.externalCreatorId || (request.provider === "tmdb" && !/^(company|network):/.test(request.externalCreatorId))) throw new Error("Некорректная заявка организации.");
  await tx.delete(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, request.provider), eq(providerCreatorExclusions.externalCreatorId, request.externalCreatorId)));
  if (input.decision === "exclude") {
    await removeGameCompanyBinding(tx, request.provider, request.externalCreatorId);
    await tx.insert(providerCreatorExclusions).values({ provider: request.provider, mediaType: request.mediaType, externalCreatorId: request.externalCreatorId, externalCreatorName: request.externalCreatorName, normalizedExternalCreatorName: request.normalizedExternalCreatorName });
    return;
  }
  let creatorId = input.creatorId;
  if (input.decision === "create") {
    if (!input.name?.trim()) throw new Error("Укажите название организации.");
    const [type] = await tx.select().from(creatorTypes).where(eq(creatorTypes.code, "organization"));
    if (!type) throw new Error("Тип organization не настроен.");
    const [next] = await tx.execute<{ id: number }>(sql`select nextval(pg_get_serial_sequence('creators','id'))::int id`);
    const [created] = await tx.insert(creators).values({ id: next.id, name: input.name.trim(), slug: `creator-${next.id}`, typeId: type.id }).returning();
    creatorId = created.id;
    await enqueueCreatorImageFill(tx, created.id);
  }
  const [creator] = creatorId ? await tx.select({ id: creators.id, type: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, creatorId)).for("update", { of: creators }) : [];
  if (!creator || creator.type !== "organization") throw new Error("Выберите организацию.");
  await removeGameCompanyBinding(tx, request.provider, request.externalCreatorId);
  await tx.insert(providerCreatorBindings).values({ provider: request.provider, externalCreatorId: request.externalCreatorId, externalCreatorName: request.externalCreatorName, creatorId: creator.id });
  await enqueueCreatorImageFill(tx, creator.id);
}

export async function removeGameCompanyBinding(tx: CreatorTransaction, provider: string, externalId: string) {
  const [binding] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, provider), eq(providerCreatorBindings.externalCreatorId, externalId), eq(providerCreatorBindings.active, true)));
  if (!binding) return;
  // Historical binding preserves its provenance until entry-locked apply removes it.
  await tx.update(providerCreatorBindings).set({ active: false, updatedAt: new Date() }).where(eq(providerCreatorBindings.id, binding.id));
}

export async function getGameCompanyRequestProfile(provider: string, externalId: string) {
  return (await db.select().from(gameCompanyProfiles).where(and(eq(gameCompanyProfiles.provider, provider), eq(gameCompanyProfiles.externalId, externalId))).limit(1))[0] ?? null;
}

export type GameCompanyDisplay = { provider: string; externalId: string; name: string; roleCode: "developer" | "publisher"; creatorId: number | null; slug: string | null };
export async function getGameCompanyDisplay(mediaItemId: number): Promise<GameCompanyDisplay[] | undefined> {
  const [rosters, manual] = await Promise.all([
    db.select().from(gameCompanyRosters).where(eq(gameCompanyRosters.mediaItemId, mediaItemId)).orderBy(asc(gameCompanyRosters.provider)),
    db.select({ creatorId: creators.id, name: creatorDisplayNameSql(), slug: creators.slug, roleCode: creatorRoles.code }).from(entryCreators).innerJoin(creators, eq(creators.id, entryCreators.creatorId)).innerJoin(creatorRoles, eq(creatorRoles.id, entryCreators.roleId)).where(and(eq(entryCreators.entryId, mediaItemId), eq(entryCreators.isManual, true), inArray(creatorRoles.code, ["developer", "publisher"]))),
  ]);
  if (!rosters.length && !manual.length) return undefined;
  const identities = [...new Set(rosters.flatMap(row => row.references.map(ref => ref.externalId)))];
  const relevantIds = identities.length ? identities : ["__empty__"];
  const [bindings, exclusions, requests] = await Promise.all([
    db.select({ provider: providerCreatorBindings.provider, externalId: providerCreatorBindings.externalCreatorId, creatorId: creators.id, name: creatorDisplayNameSql(), slug: creators.slug }).from(providerCreatorBindings).innerJoin(creators, eq(creators.id, providerCreatorBindings.creatorId)).where(and(inArray(providerCreatorBindings.provider, ["igdb", "rawg"]), inArray(providerCreatorBindings.externalCreatorId, relevantIds), eq(providerCreatorBindings.active, true))),
    db.select().from(providerCreatorExclusions).where(and(inArray(providerCreatorExclusions.provider, ["igdb", "rawg"]), inArray(providerCreatorExclusions.externalCreatorId, relevantIds))),
    db.select().from(creatorRequests).where(and(inArray(creatorRequests.provider, ["igdb", "rawg"]), eq(creatorRequests.manuallyReopened, true), inArray(creatorRequests.externalCreatorId, relevantIds))),
  ]);
  const result = new Map<string, GameCompanyDisplay>();
  for (const row of manual) result.set(`${row.creatorId}:${row.roleCode}`, { ...row, provider: "manual", externalId: String(row.creatorId), roleCode: row.roleCode as "developer" | "publisher" });
  for (const roster of rosters) for (const ref of roster.references) {
    if (exclusions.some(value => value.provider === roster.provider && value.externalCreatorId === ref.externalId)) continue;
    const pending = requests.some(value => value.provider === roster.provider && value.externalCreatorId === ref.externalId && value.decision === null);
    const binding = pending ? undefined : bindings.find(value => value.provider === roster.provider && value.externalId === ref.externalId);
    const key = binding ? `${binding.creatorId}:${ref.roleCode}` : `${roster.provider}:${ref.externalId}:${ref.roleCode}`;
    result.set(key, { provider: roster.provider, externalId: ref.externalId, roleCode: ref.roleCode, name: binding?.name ?? ref.name, creatorId: binding?.creatorId ?? null, slug: binding?.slug ?? null });
  }
  if (!rosters.length) {
    const [metadata] = await db.select({ facts: mediaItemMetadata.facts }).from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, mediaItemId));
    for (const [key, roleCode] of [["developers", "developer"], ["publishers", "publisher"]] as const) {
      for (const [index, name] of getStringListFact(metadata?.facts, key).entries()) {
        result.set(`legacy:${roleCode}:${index}`, { provider: "legacy", externalId: `${roleCode}:${index}`, name, roleCode, creatorId: null, slug: null });
      }
    }
  }
  return [...result.values()];
}

export async function getGameCompanyRosterBatch(provider: string, externalId: string, afterId = 0) {
  return db.select().from(gameCompanyRosters).where(and(eq(gameCompanyRosters.provider, provider), gt(gameCompanyRosters.mediaItemId, afterId), sql`${gameCompanyRosters.references} @> ${JSON.stringify([{ externalId }])}::jsonb`)).orderBy(asc(gameCompanyRosters.mediaItemId)).limit(100);
}
