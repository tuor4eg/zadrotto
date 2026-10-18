import { syncBggCreators, resolveBggCreatorRequest, removeBggBinding, bggRequestKey } from "./bgg-creators";
import { appendDomainEvent } from "@/lib/domain-events/persistence";
import { createJobRun } from "@/db/queries/jobs";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminActivityLogs, creators, creatorTypes, creatorRoles, creatorSeries, creatorRequests, creatorRequestMediaItems, providerCreatorMappings, providerCreatorBindings, providerCreatorExclusions, entryCreators, entryCreatorSources, mediaItems, mediaItemMetadata, jobRuns } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";
import { normalizeSearchSql } from "@/db/search";
import { extractExternalCreators, extractFantlabCreatorReferences } from "@/lib/media/creators";
import { pruneEntryCreators, type CreatorTransaction } from "./creators";
export const CREATOR_REQUEST_JOB_TYPE = "media.creator-request-apply";
export class CreatorRequestError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
        this.name = "CreatorRequestError";
    }
}
function key(provider: string, mediaType: string, name: string) {
    return and(eq(creatorRequests.provider, provider), eq(creatorRequests.mediaType, mediaType), eq(creatorRequests.normalizedExternalCreatorName, name), isNull(creatorRequests.externalCreatorId));
}
async function activity(tx: CreatorTransaction, action: string, id: number, name: string, message: string, adminId?: number, metadata: Record<string, unknown> = {}) {
    await tx.insert(adminActivityLogs).values({ action, actorType: adminId ? "admin" : "system", adminUserId: adminId, entityType: "creator-request", entityId: id, entityLabel: name, status: "success", severity: "info", message, metadata });
}
async function writerRole(tx: CreatorTransaction) {
    const [role] = await tx.select().from(creatorRoles).where(eq(creatorRoles.code, "writer"));
    if (!role)
        throw new Error("Роль writer не настроена.");
    return role;
}
async function createPerson(tx: CreatorTransaction, name: string) {
    const [type] = await tx.select().from(creatorTypes).where(eq(creatorTypes.code, "person"));
    if (!type)
        throw new Error("Тип person не настроен.");
    const [next] = await tx.execute<{
        id: number;
    }>(sql `select nextval(pg_get_serial_sequence('creators','id'))::int id`);
    return (await tx.insert(creators).values({ id: next.id, name: name.trim(), slug: `creator-${next.id}`, typeId: type.id }).returning())[0];
}
/** Lock media item first, then request keys in lexical order. Never lock items in decision transactions. */
export async function syncProviderCreators(tx: CreatorTransaction, input: {
    mediaItemId: number;
    provider: string | null;
    mediaType: string;
    facts: Record<string, unknown>;
    autoApprove?: boolean;
}) {
    if (input.provider === "bgg" && input.mediaType === "boardgame") return syncBggCreators(tx, input.mediaItemId, input.facts);
    if (input.provider === "fantlab" && input.mediaType === "book") {
        const references = extractFantlabCreatorReferences(input.facts);
        const existingSources = await tx.select({ name: entryCreatorSources.normalizedExternalCreatorName }).from(entryCreatorSources).where(and(eq(entryCreatorSources.entryId, input.mediaItemId), eq(entryCreatorSources.provider, "fantlab")));
        const relevantNames = [...new Set([...existingSources.map(value => value.name), ...(references ?? []).map(value => value.normalizedName)])].sort();
        const moderation = relevantNames.length ? await tx.select().from(creatorRequests).where(and(eq(creatorRequests.provider, "fantlab"), eq(creatorRequests.mediaType, "book"), inArray(creatorRequests.normalizedExternalCreatorName, relevantNames))).orderBy(asc(creatorRequests.normalizedExternalCreatorName)).for("update") : [];
        const exclusions = relevantNames.length ? await tx.select().from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, "fantlab"), eq(providerCreatorExclusions.mediaType, "book"), inArray(providerCreatorExclusions.normalizedExternalCreatorName, relevantNames))) : [];
        const suppressed = new Set([
            ...exclusions.map(value => value.normalizedExternalCreatorName),
            ...moderation.filter(value => value.decision === "exclude" || (value.decision === null && value.manuallyReopened)).map(value => value.normalizedExternalCreatorName),
        ]);
        // Explicit moderation still removes provenance from old name-only snapshots.
        for (const normalizedName of suppressed) await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId, input.mediaItemId), eq(entryCreatorSources.provider, "fantlab"), eq(entryCreatorSources.normalizedExternalCreatorName, normalizedName)));
        if (references === null) {
            await pruneEntryCreators(tx, input.mediaItemId);
            return { createdCreators: 0, createdMappings: 0, createdLinks: 0 };
        }
        const externalIds = references.map(value => value.id);
        const initialBindings = externalIds.length ? await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "fantlab"), inArray(providerCreatorBindings.externalCreatorId, externalIds))) : [];
        const creatorIds = [...new Set(initialBindings.map(value => value.creatorId))].sort((a, b) => a - b);
        if (creatorIds.length) await tx.select({ id: creators.id }).from(creators).where(inArray(creators.id, creatorIds)).orderBy(asc(creators.id)).for("update");
        const currentBindings = externalIds.length ? await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "fantlab"), inArray(providerCreatorBindings.externalCreatorId, externalIds))) : [];
        const resolved = references.map(reference => ({ reference, binding: currentBindings.find(value => value.externalCreatorId === reference.id && creatorIds.includes(value.creatorId)) }));
        // Incomplete identity migration must never erase the populated archive's old provenance.
        const complete = resolved.every(value => value.binding || suppressed.has(value.reference.normalizedName));
        if (complete) {
            await tx.delete(entryCreatorSources).where(eq(entryCreatorSources.entryId, input.mediaItemId));
            await tx.delete(creatorRequestMediaItems).where(eq(creatorRequestMediaItems.mediaItemId, input.mediaItemId));
        }
        let createdMappings = 0, createdLinks = 0;
        const diagnostics: { externalCreatorId: string; name: string; reason: string }[] = [];
        const role = references.length ? await writerRole(tx) : null;
        for (const { reference, binding } of resolved.sort((a, b) => a.reference.normalizedName.localeCompare(b.reference.normalizedName) || a.reference.id.localeCompare(b.reference.id))) {
            const request = moderation.find(value => value.normalizedExternalCreatorName === reference.normalizedName);
            if (request) {
                await tx.insert(creatorRequestMediaItems).values({ requestId: request.id, mediaItemId: input.mediaItemId, roleId: role!.id, externalCreatorName: reference.name }).onConflictDoNothing();
                await tx.update(creatorRequests).set({ lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
            }
            if (suppressed.has(reference.normalizedName)) continue;
            if (!binding) {
                diagnostics.push({ externalCreatorId: reference.id, name: reference.name, reason: "unconfirmed-id" });
                continue;
            }
            const aliasKey = and(eq(providerCreatorMappings.provider, "fantlab"), eq(providerCreatorMappings.mediaType, "book"), eq(providerCreatorMappings.normalizedExternalCreatorName, reference.normalizedName));
            // Identity comes exclusively from the binding. Alias collisions never select or replace a Creator.
            const [inserted] = await tx.insert(providerCreatorMappings).values({ provider: "fantlab", mediaType: "book", externalCreatorName: reference.name, normalizedExternalCreatorName: reference.normalizedName, creatorId: binding.creatorId, bindingId: binding.id }).onConflictDoNothing().returning();
            if (inserted) createdMappings++;
            const [alias] = inserted ? [inserted] : await tx.select().from(providerCreatorMappings).where(aliasKey);
            if (alias && alias.creatorId === binding.creatorId && (alias.bindingId === null || alias.bindingId === binding.id)) {
                await tx.update(providerCreatorMappings).set({ bindingId: binding.id, externalCreatorName: reference.name, updatedAt: new Date() }).where(and(eq(providerCreatorMappings.id, alias.id), eq(providerCreatorMappings.creatorId, binding.creatorId), alias.bindingId === null ? isNull(providerCreatorMappings.bindingId) : eq(providerCreatorMappings.bindingId, binding.id)));
            } else diagnostics.push({ externalCreatorId: reference.id, name: reference.name, reason: "alias-conflict" });
            const [added] = await tx.insert(entryCreators).values({ entryId: input.mediaItemId, creatorId: binding.creatorId, roleId: role!.id }).onConflictDoNothing().returning();
            if (added) createdLinks++;
            await tx.insert(entryCreatorSources).values({ entryId: input.mediaItemId, creatorId: binding.creatorId, roleId: role!.id, provider: "fantlab", normalizedExternalCreatorName: reference.normalizedName }).onConflictDoNothing();
        }
        if (diagnostics.length) await tx.insert(adminActivityLogs).values({ action: "creator.updated", actorType: "system", entityType: "media-item", entityId: input.mediaItemId, status: "success", severity: "warning", message: "Синхронизация авторов FantLab требует проверки ID или вариантов имени.", metadata: { provider: "fantlab", diagnostics } });
        await pruneEntryCreators(tx, input.mediaItemId);
        return { createdCreators: 0, createdMappings, createdLinks };
    }
    const external = input.mediaType === "book" && input.provider ? extractExternalCreators(input.facts) : [];
    await tx.delete(entryCreatorSources).where(eq(entryCreatorSources.entryId, input.mediaItemId));
    await tx.delete(creatorRequestMediaItems).where(eq(creatorRequestMediaItems.mediaItemId, input.mediaItemId));
    let createdCreators = 0, createdMappings = 0, createdLinks = 0;
    const role = external.length ? await writerRole(tx) : null;
    for (const value of [...external].sort((a, b) => a.normalizedName.localeCompare(b.normalizedName))) {
        const provider = input.provider!;
        const [detected] = await tx.insert(creatorRequests).values({ provider, mediaType: input.mediaType, externalCreatorName: value.name, normalizedExternalCreatorName: value.normalizedName }).onConflictDoNothing().returning();
        const [request] = await tx.select().from(creatorRequests).where(key(provider, input.mediaType, value.normalizedName)).for("update");
        if (detected)
            await activity(tx, "creator-request.detected", request.id, value.name, "Обнаружен неизвестный создатель записи.", undefined, { mediaItemId: input.mediaItemId, provider });
        await tx.insert(creatorRequestMediaItems).values({ requestId: request.id, mediaItemId: input.mediaItemId, roleId: role!.id, externalCreatorName: value.name });
        await tx.update(creatorRequests).set({ lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
        const mappingKey = and(eq(providerCreatorMappings.provider, provider), eq(providerCreatorMappings.mediaType, input.mediaType), eq(providerCreatorMappings.normalizedExternalCreatorName, value.normalizedName));
        let [mapping] = await tx.select().from(providerCreatorMappings).where(mappingKey);
        const [excluded] = await tx.select().from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, provider), eq(providerCreatorExclusions.mediaType, input.mediaType), eq(providerCreatorExclusions.normalizedExternalCreatorName, value.normalizedName)));
        if (!mapping && !excluded && input.autoApprove && !request.manuallyReopened && request.decision === null && request.applyStatus === "pending") {
            // Across providers, serialize exact-name reuse without conflating distinct normalized names.
            await tx.execute(sql `select pg_advisory_xact_lock(hashtextextended(${`creator:${value.normalizedName}`},0))`);
            const candidates = await tx.select({ id: creators.id }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(and(eq(creatorTypes.code, "person"), sql `btrim(${normalizeSearchSql(creators.name)})=${value.normalizedName}`));
            if (candidates.length <= 1) {
                let creatorId = candidates[0]?.id;
                if (!creatorId) {
                    creatorId = (await createPerson(tx, value.name)).id;
                    createdCreators++;
                }
                [mapping] = await tx.insert(providerCreatorMappings).values({ provider, mediaType: input.mediaType, externalCreatorName: value.name, normalizedExternalCreatorName: value.normalizedName, creatorId }).returning();
                createdMappings++;
                await tx.update(creatorRequests).set({ decision: candidates.length ? "map" : "create", resolvedAt: new Date(), applyStatus: "processed", updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
            }
        }
        if (detected && !mapping && !excluded && request.decision === null) {
            const event = await appendDomainEvent(tx, { type: "creator-request.created", actorAuthorId: null,
                aggregateType: "creator-request", aggregateId: String(request.id), payload: { requestId: request.id } });
            // Persist the fast-path job in the caller's transaction; it cannot run before commit.
            await createJobRun({ type: "domain-events.dispatch", payload: { eventId: event.id }, source: "event",
                maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
        }
        if (mapping && !excluded) {
            const [added] = await tx.insert(entryCreators).values({ entryId: input.mediaItemId, creatorId: mapping.creatorId, roleId: role!.id }).onConflictDoNothing().returning();
            if (added)
                createdLinks++;
            await tx.insert(entryCreatorSources).values({ entryId: input.mediaItemId, creatorId: mapping.creatorId, roleId: role!.id, provider, normalizedExternalCreatorName: value.normalizedName }).onConflictDoNothing();
        }
    }
    await pruneEntryCreators(tx, input.mediaItemId);
    return { createdCreators, createdMappings, createdLinks };
}
const statusSql = sql<"pending" | "applying" | "processed" | "failed"> `case when ${jobRuns.status} in ('queued','running') then 'applying' when ${jobRuns.status} in ('failed','cancelled') then 'failed' when ${jobRuns.status}='succeeded' then case when ${creatorRequests.decision} is null then 'pending' else 'processed' end else ${creatorRequests.applyStatus} end`;
export async function getCreatorRequests(input: {
    all?: boolean;
    requestId?: number;
} = {}) {
    return db.select({ id: creatorRequests.id, provider: creatorRequests.provider, externalCreatorId: creatorRequests.externalCreatorId, roles: sql<string[]>`coalesce((select jsonb_agg(distinct r.name) from creator_request_media_items o join creator_roles r on r.id=o.role_id where o.request_id=${creatorRequests.id}), '[]'::jsonb)`, mediaType: creatorRequests.mediaType, externalCreatorName: creatorRequests.externalCreatorName, normalizedExternalCreatorName: creatorRequests.normalizedExternalCreatorName, decision: creatorRequests.decision, status: statusSql, jobRunId: creatorRequests.jobRunId, jobError: sql<string | null> `coalesce(${jobRuns.errorMessage},${creatorRequests.jobError})`, firstSeenAt: creatorRequests.firstSeenAt, occurrenceCount: sql<number> `(select count(distinct o.media_item_id)::int from ${creatorRequestMediaItems} o where o.request_id=${creatorRequests.id})` }).from(creatorRequests).leftJoin(jobRuns, eq(jobRuns.id, creatorRequests.jobRunId)).where(and(input.all ? undefined : isNull(creatorRequests.decision), input.requestId ? eq(creatorRequests.id, input.requestId) : undefined)).orderBy(asc(creatorRequests.firstSeenAt), asc(creatorRequests.id));
}
export async function getCreatorExclusions() {
    return db.select().from(providerCreatorExclusions).orderBy(asc(providerCreatorExclusions.externalCreatorName));
}
export async function getPendingCreatorRequestCount() {
    const [row] = await db.select({ count: sql<number> `count(*)::int` }).from(creatorRequests).where(isNull(creatorRequests.decision));
    return row.count;
}
async function assertIdle(tx: CreatorTransaction, request: typeof creatorRequests.$inferSelect) {
    const [run] = request.jobRunId ? await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId)) : [];
    if (run ? ["queued", "running"].includes(run.status) : request.applyStatus === "applying")
        throw new CreatorRequestError("applying", "Дождитесь завершения текущей задачи.");
}
async function enqueue(tx: CreatorTransaction, requestId: number, adminId?: number, orphanCreatorId?: number) {
    const now = new Date();
    const [run] = await tx.insert(jobRuns).values({ type: CREATOR_REQUEST_JOB_TYPE, payload: { requestId, ...(orphanCreatorId ? { orphanCreatorId } : {}) }, source: adminId ? "manual" : "event", createdByAdminId: adminId, scheduledFor: now, availableAt: now, maxAttempts: 3, timeoutSeconds: 900, retryBaseSeconds: 60, retryMaxSeconds: 3600 }).returning({ id: jobRuns.id });
    await tx.update(creatorRequests).set({ jobRunId: run.id, applyStatus: "applying", jobError: null, updatedAt: now }).where(eq(creatorRequests.id, requestId));
    return { requestId, jobRunId: run.id };
}
export async function resolveCreatorRequest(input: {
    requestId: number;
    adminId?: number;
    autoApprove?: boolean;
    decision: "create" | "map" | "exclude";
    creatorId?: number;
    name?: string;
    typeCode?: "person" | "collective";
}) {
    return db.transaction(async (tx) => {
        if (!["create", "map", "exclude"].includes(input.decision))
            throw new CreatorRequestError("invalid-decision", "Неизвестное решение.");
        const [request] = await tx.select().from(creatorRequests).where(eq(creatorRequests.id, input.requestId)).for("update");
        if (!request)
            throw new CreatorRequestError("not-found", "Заявка не найдена.");
        await assertIdle(tx, request);
        if (request.decision !== null)
            throw new CreatorRequestError("already-resolved", "Решение уже принято.");
        if (input.autoApprove && (request.provider !== "bgg" || request.externalCreatorId === null || request.manuallyReopened || request.applyStatus !== "pending")) {
            throw new CreatorRequestError("auto-skip", "Заявка требует ручного решения.");
        }
        if (request.externalCreatorId !== null && request.provider === "bgg") {
            const resolvedInput = { ...input };
            if (input.autoApprove) {
                const occurrences = await tx.select({ name: creatorRequestMediaItems.externalCreatorName }).from(creatorRequestMediaItems).where(eq(creatorRequestMediaItems.requestId, request.id));
                if (new Set(occurrences.map(value => normalizeSearchText(value.name))).size > 1) throw new CreatorRequestError("auto-skip", "В заявке разные варианты имени; требуется проверка.");
                // The ordinary approval transaction makes the decision and queues the ordinary apply job.
                await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator:${request.normalizedExternalCreatorName}`},0))`);
                const candidates = await tx.select({ id: creators.id }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(and(
                    inArray(creatorTypes.code, ["person", "collective"]), or(
                        sql`btrim(${normalizeSearchSql(creators.name)})=${request.normalizedExternalCreatorName}`,
                        sql`btrim(${normalizeSearchSql(creators.originalName)})=${request.normalizedExternalCreatorName}`,
                    ),
                ));
                if (candidates.length > 1) throw new CreatorRequestError("auto-skip", "Неоднозначное имя.");
                if (candidates.length === 1) {
                    await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, candidates[0].id)).for("update");
                    const conflict = await tx.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "bgg"), eq(providerCreatorBindings.creatorId, candidates[0].id), sql`${providerCreatorBindings.externalCreatorId} <> ${request.externalCreatorId}`));
                    if (conflict.length) throw new CreatorRequestError("auto-skip", "Конфликт BGG ID.");
                    resolvedInput.decision = "map";
                    resolvedInput.creatorId = candidates[0].id;
                } else {
                    resolvedInput.decision = "create";
                    resolvedInput.name = request.externalCreatorName;
                    resolvedInput.typeCode = "person";
                }
            }
            await resolveBggCreatorRequest(tx, request, resolvedInput);
            await tx.update(creatorRequests).set({ decision: resolvedInput.decision, resolvedByAdminId: input.adminId, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
            const queued = await enqueue(tx, request.id, input.adminId);
            await activity(tx, "creator-request.resolved", request.id, request.externalCreatorName, "Принято решение по BGG ID.", input.adminId, { decision: resolvedInput.decision, automatic: input.autoApprove === true, ...queued });
            return queued;
        }
        let creatorId = input.creatorId;
        if (input.decision === "create") {
            if (!input.name?.trim())
                throw new CreatorRequestError("invalid-name", "Укажите имя.");
            creatorId = (await createPerson(tx, input.name)).id;
        }
        if (input.decision === "map") {
            const [creator] = creatorId ? await tx.select({ code: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, creatorId)) : [];
            if (!creator || creator.code !== "person")
                throw new CreatorRequestError("invalid-creator", "Выберите создателя типа person.");
        }
        const values = { provider: request.provider, mediaType: request.mediaType, externalCreatorName: request.externalCreatorName, normalizedExternalCreatorName: request.normalizedExternalCreatorName };
        if (input.decision === "exclude")
            await tx.insert(providerCreatorExclusions).values(values);
        else
            await tx.insert(providerCreatorMappings).values({ ...values, creatorId: creatorId! });
        await tx.update(creatorRequests).set({ decision: input.decision, resolvedByAdminId: input.adminId, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
        const queued = await enqueue(tx, request.id, input.adminId);
        await activity(tx, "creator-request.resolved", request.id, request.externalCreatorName, "Принято решение по создателю.", input.adminId, { decision: input.decision, ...queued });
        return queued;
    });
}
async function reopen(input: {
    mappingId?: number;
    exclusionId?: number;
    adminId: number;
}) {
    return db.transaction(async (tx) => {
        const table = input.mappingId ? providerCreatorMappings : providerCreatorExclusions;
        const [value] = await tx.select().from(table).where(eq(table.id, input.mappingId ?? input.exclusionId!));
        if (!value)
            throw new CreatorRequestError("not-found", "Соответствие не найдено.");
        await tx.insert(creatorRequests).values({ provider: value.provider, mediaType: value.mediaType, externalCreatorId: "externalCreatorId" in value ? value.externalCreatorId : null, externalCreatorName: value.externalCreatorName, normalizedExternalCreatorName: value.normalizedExternalCreatorName }).onConflictDoNothing();
        const externalCreatorId = "externalCreatorId" in value ? value.externalCreatorId : null;
        const [request] = await tx.select().from(creatorRequests).where(externalCreatorId ? bggRequestKey(externalCreatorId) : key(value.provider, value.mediaType, value.normalizedExternalCreatorName)).for("update");
        await assertIdle(tx, request);
        if (externalCreatorId) await removeBggBinding(tx, externalCreatorId);
        const deleted = await tx.delete(table).where(eq(table.id, value.id)).returning({ id: table.id });
        if (!deleted.length)
            throw new CreatorRequestError("changed", "Соответствие уже изменено.");
        await tx.update(creatorRequests).set({ decision: null, resolvedAt: null, resolvedByAdminId: null, manuallyReopened: true, updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
        const orphanCreatorId = "creatorId" in value ? Number(value.creatorId) : undefined;
        const queued = await enqueue(tx, request.id, input.adminId, orphanCreatorId);
        await activity(tx, "creator-mapping.reopened", request.id, value.externalCreatorName, "Значение возвращено на апрув.", input.adminId, queued);
        return queued;
    });
}
export async function reopenCreatorMapping(input: {
    mappingId: number;
    adminId: number;
}) {
    return reopen(input);
}
export async function reopenCreatorExclusion(input: {
    exclusionId: number;
    adminId: number;
}) {
    return reopen(input);
}
export async function retryCreatorRequest(input: {
    requestId: number;
    adminId: number;
}) {
    return db.transaction(async (tx) => {
        const [request] = await tx.select().from(creatorRequests).where(eq(creatorRequests.id, input.requestId)).for("update");
        if (!request)
            throw new CreatorRequestError("not-found", "Заявка не найдена.");
        await assertIdle(tx, request);
        const [run] = request.jobRunId ? await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId)) : [];
        if (run ? !["failed", "cancelled"].includes(run.status) : request.applyStatus !== "failed")
            throw new CreatorRequestError("not-retryable", "Повтор доступен после ошибки.");
        const orphanCreatorId = run?.payload.orphanCreatorId;
        return enqueue(tx, request.id, input.adminId, typeof orphanCreatorId === "number" ? orphanCreatorId : undefined);
    });
}
export async function applyCreatorRequest(requestId: number, input: {
    signal?: AbortSignal;
    jobRunId?: number;
} = {}) {
    const [request] = await db.select().from(creatorRequests).where(eq(creatorRequests.id, requestId));
    if (!request)
        throw new Error("Заявка не найдена.");
    if (input.jobRunId && request.jobRunId !== input.jobRunId)
        return { processed: 0 };
    const [run] = input.jobRunId ? await db.select({ payload: jobRuns.payload }).from(jobRuns).where(eq(jobRuns.id, input.jobRunId)) : [];
    const orphanCreatorId = run?.payload.orphanCreatorId;
    let processed = 0, afterId = 0;
    try {
        for (;;) {
            input.signal?.throwIfAborted();
            const items = request.decision === null
                ? await db.select({ id: mediaItems.id }).from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(and(eq(mediaItems.mediaType, request.mediaType), eq(mediaItemMetadata.sourceProvider, request.provider), gt(mediaItems.id, afterId))).orderBy(asc(mediaItems.id)).limit(100)
                : await db.selectDistinct({ id: creatorRequestMediaItems.mediaItemId }).from(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.requestId, requestId), gt(creatorRequestMediaItems.mediaItemId, afterId))).orderBy(asc(creatorRequestMediaItems.mediaItemId)).limit(100);
            if (!items.length)
                break;
            for (const item of items) {
                input.signal?.throwIfAborted();
                await db.transaction(async (tx) => {
                    const [entry] = await tx.select().from(mediaItems).where(eq(mediaItems.id, item.id)).for("update");
                    const [metadata] = await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, item.id));
                    if (!entry || !metadata)
                        return;
                    if (request.decision === null) {
                        if (metadata.sourceProvider !== request.provider || entry.mediaType !== request.mediaType)
                            return;
                        try {
                            extractExternalCreators(metadata.facts);
                        }
                        catch {
                            await activity(tx, "creator-request.metadata-invalid", requestId, request.externalCreatorName, "При пересчёте пропущена запись с некорректными авторами в metadata.", undefined, { mediaItemId: item.id });
                            return;
                        }
                    }
                    await syncProviderCreators(tx, { mediaItemId: item.id, provider: metadata.sourceProvider, mediaType: entry.mediaType, facts: metadata.facts });
                });
                afterId = item.id;
                processed++;
            }
        }
        await db.transaction(async tx => {
            const [current] = await tx.select().from(creatorRequests).where(eq(creatorRequests.id, requestId)).for("update");
            if (!current || (input.jobRunId && current.jobRunId !== input.jobRunId)) return;
            if (current.externalCreatorId === null && current.decision === null && typeof orphanCreatorId === "number") {
                await deleteUnlinkedCreator(tx, orphanCreatorId);
            }
            await tx.update(creatorRequests).set({ applyStatus: current.decision === null ? "pending" : "processed", jobError: null, updatedAt: new Date() }).where(eq(creatorRequests.id, requestId));
        });
        return { processed };
    }
    catch (error) {
        await db.update(creatorRequests).set({ applyStatus: "failed", jobError: "Не удалось применить решение. Подробности в журнале задачи.", updatedAt: new Date() }).where(and(eq(creatorRequests.id, requestId), input.jobRunId ? eq(creatorRequests.jobRunId, input.jobRunId) : undefined));
        throw error;
    }
}
export async function backfillCreators(signal?: AbortSignal) {
    const result = { processed: 0, createdCreators: 0, createdMappings: 0, createdLinks: 0, errors: [] as {
            entryId: number;
            message: string;
        }[] };
    let afterId = 0;
    for (;;) {
        signal?.throwIfAborted();
        const items = await db.select({ id: mediaItems.id }).from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(and(eq(mediaItems.mediaType, "book"), gt(mediaItems.id, afterId))).orderBy(asc(mediaItems.id)).limit(100);
        if (!items.length)
            break;
        for (const item of items) {
            signal?.throwIfAborted();
            try {
                const added = await db.transaction(async (tx) => {
                    const [entry] = await tx.select().from(mediaItems).where(eq(mediaItems.id, item.id)).for("update");
                    const [metadata] = await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, item.id));
                    return entry && metadata ? syncProviderCreators(tx, { mediaItemId: item.id, provider: metadata.sourceProvider, mediaType: entry.mediaType, facts: metadata.facts, autoApprove: true }) : { createdCreators: 0, createdMappings: 0, createdLinks: 0 };
                });
                result.createdCreators += added.createdCreators;
                result.createdMappings += added.createdMappings;
                result.createdLinks += added.createdLinks;
            }
            catch (error) {
                signal?.throwIfAborted();
                result.errors.push({ entryId: item.id, message: error instanceof Error ? error.message : "Ошибка записи" });
            }
            result.processed++;
            afterId = item.id;
        }
    }
    return result;
}

export async function getCreatorRequestEntries(requestId: number) {
    return db.select({ id: mediaItems.id, title: mediaItems.title, code: mediaItems.code, roleName: creatorRoles.name })
        .from(creatorRequestMediaItems).innerJoin(creatorRoles, eq(creatorRoles.id, creatorRequestMediaItems.roleId)).innerJoin(mediaItems, eq(mediaItems.id, creatorRequestMediaItems.mediaItemId))
        .where(eq(creatorRequestMediaItems.requestId, requestId)).orderBy(asc(mediaItems.id));
}

/** Only the Creator explicitly affected by returning a mapping is eligible for cleanup. */
export async function deleteUnlinkedCreator(tx: CreatorTransaction, creatorId: number) {
    await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, creatorId)).for("update");
    const [deleted] = await tx.delete(creators).where(and(eq(creators.id, creatorId),
        sql`not exists (select 1 from ${providerCreatorMappings} m where m.creator_id = ${creators.id})`,
        sql`not exists (select 1 from provider_creator_bindings b where b.creator_id = ${creators.id})`,
        sql`not exists (select 1 from ${entryCreators} ec where ec.creator_id = ${creators.id})`,
        sql`not exists (select 1 from ${creatorSeries} cs where cs.creator_id = ${creators.id})`,
        sql`not exists (select 1 from creator_relations cr where cr.source_creator_id=${creators.id} or cr.target_creator_id=${creators.id})`,
        sql`not exists (select 1 from entry_creator_pseudonyms p where p.creator_id=${creators.id})`,
    )).returning({ id: creators.id, name: creators.name });
    if (deleted) await tx.insert(adminActivityLogs).values({ action: "creator.deleted", actorType: "system",
        entityType: "creator", entityId: deleted.id, entityLabel: deleted.name, status: "success", severity: "info",
        message: "Создатель удалён после возврата последнего соответствия в заявки." });
    return deleted?.id ?? null;
}

export async function reopenCreatorBinding(input: { bindingId: number; adminId: number }) {
    return db.transaction(async tx => {
        const [binding] = await tx.select().from(providerCreatorBindings).where(eq(providerCreatorBindings.id, input.bindingId));
        if (!binding || binding.provider !== "bgg") throw new CreatorRequestError("not-found", "Привязка BGG не найдена.");
        const name = binding.externalCreatorName ?? binding.externalCreatorId;
        await tx.insert(creatorRequests).values({ provider: "bgg", externalCreatorId: binding.externalCreatorId, mediaType: "boardgame", externalCreatorName: name, normalizedExternalCreatorName: normalizeSearchText(name) }).onConflictDoNothing();
        const [request] = await tx.select().from(creatorRequests).where(bggRequestKey(binding.externalCreatorId)).for("update");
        await assertIdle(tx, request);
        // Recheck the binding after request lock; a concurrent administrator may have remapped it.
        const [current] = await tx.select().from(providerCreatorBindings).where(eq(providerCreatorBindings.id, input.bindingId));
        if (!current || current.creatorId !== binding.creatorId) throw new CreatorRequestError("changed", "Привязка уже изменилась.");
        await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, binding.creatorId)).for("update");
        await removeBggBinding(tx, binding.externalCreatorId);
        await deleteUnlinkedCreator(tx, binding.creatorId);
        await tx.update(creatorRequests).set({ decision: null, resolvedAt: null, resolvedByAdminId: null, manuallyReopened: true, updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
        const queued = await enqueue(tx, request.id, input.adminId);
        await activity(tx, "creator-mapping.reopened", request.id, name, "BGG ID возвращён на апрув.", input.adminId, queued);
        return queued;
    });
}

/** A backfill convenience: every decision still passes through the normal approval/apply flow. */
export async function autoApproveBggCreatorRequests(mediaItemId: number) {
    const pending = await db.selectDistinct({ id: creatorRequests.id }).from(creatorRequests)
        .innerJoin(creatorRequestMediaItems, eq(creatorRequestMediaItems.requestId, creatorRequests.id))
        .where(and(eq(creatorRequests.provider, "bgg"), isNull(creatorRequests.decision), eq(creatorRequests.manuallyReopened, false),
            eq(creatorRequests.applyStatus, "pending"), eq(creatorRequestMediaItems.mediaItemId, mediaItemId)))
        .orderBy(asc(creatorRequests.id));
    let approved = 0, skipped = 0;
    for (const request of pending) {
        try {
            await resolveCreatorRequest({ requestId: request.id, decision: "create", autoApprove: true });
            approved++;
        } catch (error) {
            if (error instanceof CreatorRequestError && ["auto-skip", "already-resolved", "applying"].includes(error.code)) skipped++;
            else throw error;
        }
    }
    return { approved, skipped };
}
