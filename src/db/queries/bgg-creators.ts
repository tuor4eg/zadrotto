import { getImportedCreatorNameLocalization } from "./creator-name-import";
import { enqueueCreatorImageFill } from "./creator-image-jobs";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { creators, creatorTypes, creatorRoles, creatorRequests, creatorRequestMediaItems, providerCreatorBindings, providerCreatorExclusions, entryCreators, entryCreatorSources } from "@/db/schema";
import { normalizeSearchSql } from "@/db/search";
import { extractBggCreatorReferences } from "@/lib/media/creators";
import { appendDomainEvent } from "@/lib/domain-events/persistence";
import { createJobRun } from "@/db/queries/jobs";
import { pruneEntryCreators, type CreatorTransaction } from "./creators";

export const bggRequestKey = (id: string) => and(eq(creatorRequests.provider, "bgg"), eq(creatorRequests.externalCreatorId, id));

/** Caller locks the media item. Request identity is role-independent; provenance is not. */
export async function syncBggCreators(tx: CreatorTransaction, entryId: number, facts: Record<string, unknown>) {
  const references = extractBggCreatorReferences(facts);
  if (references === null) return { createdCreators: 0, createdMappings: 0, createdLinks: 0 };
  const roleRows = await tx.select().from(creatorRoles).where(inArray(creatorRoles.code, ["designer", "artist"]));
  const roles = new Map(roleRows.map(role => [role.code, role.id]));
  if (references.some(reference => !roles.has(reference.roleCode))) throw new Error("Роли создателей BGG не настроены.");
  // Parse the complete roster before touching existing sources. Invalid payloads roll back.
  const grouped = new Map<string, typeof references>();
  for (const reference of references) grouped.set(reference.externalId, [...(grouped.get(reference.externalId) ?? []), reference]);
  const requests: { request: typeof creatorRequests.$inferSelect; refs: typeof references; detected: boolean }[] = [];
  for (const [externalId, refs] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    const [detected] = await tx.insert(creatorRequests).values({ provider: "bgg", externalCreatorId: externalId,
      mediaType: "boardgame", externalCreatorName: refs[0].name, normalizedExternalCreatorName: refs[0].normalizedName,
    }).onConflictDoNothing().returning();
    const [request] = await tx.select().from(creatorRequests).where(bggRequestKey(externalId)).for("update");
    requests.push({ request, refs, detected: Boolean(detected) });
  }
  await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId, entryId), eq(entryCreatorSources.provider, "bgg")));
  await tx.delete(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.mediaItemId, entryId), sql`${creatorRequestMediaItems.requestId} in (select id from creator_requests where provider='bgg' and external_creator_id is not null)`));
  let createdMappings = 0, createdLinks = 0;
  for (const { request, refs, detected } of requests) {
    const externalId = request.externalCreatorId!;
    await tx.insert(creatorRequestMediaItems).values(refs.map(reference => ({ requestId: request.id, mediaItemId: entryId, roleId: roles.get(reference.roleCode)!, externalCreatorName: reference.name }))).onConflictDoNothing();
    await tx.update(creatorRequests).set({ externalCreatorName: refs[0].name, normalizedExternalCreatorName: refs[0].normalizedName, lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
    const [excluded] = await tx.select().from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, "bgg"), eq(providerCreatorExclusions.externalCreatorId, externalId)));
    let [binding] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "bgg"), eq(providerCreatorBindings.externalCreatorId, externalId)));
    if (!excluded && request.decision !== "exclude" && !request.manuallyReopened && !binding && detected && new Set(refs.map(reference => reference.normalizedName)).size === 1) {
      // Same exact name across simultaneous IDs may select at most one BGG identity automatically.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator:${refs[0].normalizedName}`},0))`);
      const candidates = await tx.select({ id: creators.id }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(and(
        inArray(creatorTypes.code, ["person", "collective"]), or(
          sql`btrim(${normalizeSearchSql(creators.name)})=${refs[0].normalizedName}`,
          sql`btrim(${normalizeSearchSql(creators.originalName)})=${refs[0].normalizedName}`,
        ),
      ));
      if (candidates.length === 1) {
        await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, candidates[0].id)).for("update");
        const conflict = await tx.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "bgg"), eq(providerCreatorBindings.creatorId, candidates[0].id)));
        if (!conflict.length) {
          [binding] = await tx.insert(providerCreatorBindings).values({ provider: "bgg", externalCreatorId: externalId, externalCreatorName: refs[0].name, creatorId: candidates[0].id }).returning();
          await enqueueCreatorImageFill(tx, binding.creatorId);
          createdMappings++;
        }
      }
    }
    const allowed = binding && !excluded && request.decision !== "exclude" && !(request.decision === null && request.manuallyReopened);
    if (allowed) {
      await tx.update(providerCreatorBindings).set({ externalCreatorName: refs[0].name, updatedAt: new Date() }).where(eq(providerCreatorBindings.id, binding.id));
      if (request.decision === null) await tx.update(creatorRequests).set({ decision: "map", resolvedAt: new Date(), applyStatus: "processed", updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
      for (const reference of refs) {
        const roleId = roles.get(reference.roleCode)!;
        const [added] = await tx.insert(entryCreators).values({ entryId, creatorId: binding.creatorId, roleId }).onConflictDoNothing().returning();
        if (added) createdLinks++;
        // Stable technical key prevents name changes from changing source identity.
        await tx.insert(entryCreatorSources).values({ entryId, creatorId: binding.creatorId, roleId, provider: "bgg", bindingId: binding.id, normalizedExternalCreatorName: `bgg:${externalId}` }).onConflictDoNothing();
      }
    } else if (detected && !excluded) {
      const event = await appendDomainEvent(tx, { type: "creator-request.created", actorAuthorId: null, aggregateType: "creator-request", aggregateId: String(request.id), payload: { requestId: request.id } });
      await createJobRun({ type: "domain-events.dispatch", payload: { eventId: event.id }, source: "event", maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
    }
  }
  await pruneEntryCreators(tx, entryId);
  return { createdCreators: 0, createdMappings, createdLinks };
}

/** Decision/reopen transactions never lock MediaItems: delete only owned provider provenance. */
export async function removeBggBinding(tx: CreatorTransaction, externalId: string) {
  const [binding] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "bgg"), eq(providerCreatorBindings.externalCreatorId, externalId)));
  if (!binding) return;
  await tx.delete(entryCreatorSources).where(eq(entryCreatorSources.bindingId, binding.id));
  await tx.delete(entryCreators).where(and(eq(entryCreators.creatorId, binding.creatorId), eq(entryCreators.isManual, false), sql`not exists(select 1 from entry_creator_sources s where s.entry_id=${entryCreators.entryId} and s.creator_id=${entryCreators.creatorId} and s.role_id=${entryCreators.roleId})`));
  await tx.delete(providerCreatorBindings).where(eq(providerCreatorBindings.id, binding.id));
}

export async function resolveBggCreatorRequest(tx: CreatorTransaction, request: typeof creatorRequests.$inferSelect, input: { decision: "create" | "map" | "exclude"; creatorId?: number; name?: string; typeCode?: "person" | "collective" }) {
  const externalId = request.externalCreatorId!;
  await removeBggBinding(tx, externalId);
  await tx.delete(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, "bgg"), eq(providerCreatorExclusions.externalCreatorId, externalId)));
  if (input.decision === "exclude") {
    await tx.insert(providerCreatorExclusions).values({ provider: "bgg", externalCreatorId: externalId, mediaType: request.mediaType, externalCreatorName: request.externalCreatorName, normalizedExternalCreatorName: request.normalizedExternalCreatorName });
    return;
  }
  let creatorId = input.creatorId;
  if (input.decision === "create") {
    if (!input.name?.trim() || !["person", "collective"].includes(input.typeCode ?? "")) throw new Error("Выберите имя и тип создателя.");
    const [type] = await tx.select().from(creatorTypes).where(eq(creatorTypes.code, input.typeCode!));
    if (!type) throw new Error("Тип создателя не настроен.");
    const [next] = await tx.execute<{ id: number }>(sql`select nextval(pg_get_serial_sequence('creators','id'))::int id`);
    const [created] = await tx.insert(creators).values({ id: next.id, name: input.name.trim(), ...(input.typeCode === "person" ? getImportedCreatorNameLocalization({ name: input.name }) : {}), typeId: type.id, slug: `creator-${next.id}` }).returning();
    creatorId = created.id;
    await enqueueCreatorImageFill(tx, created.id);
  }
  const [creator] = creatorId ? await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, creatorId)).for("update") : [];
  if (!creator) throw new Error("Выберите существующего создателя.");
  await tx.insert(providerCreatorBindings).values({ provider: "bgg", externalCreatorId: externalId, externalCreatorName: request.externalCreatorName, creatorId: creator.id });
  await enqueueCreatorImageFill(tx, creator.id);
}
