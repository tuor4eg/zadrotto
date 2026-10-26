import { animeCompanyLogoSourceAllowed, animeCompanyLogoSourceName, validateAnimeCompanyLogoEvidence, type AnimeCompanyLogoEvidence } from "./anime-company-logo-binding";
import { isAniListPersonId } from "@/lib/creators/anilist-identity";
import { syncAniListCreators } from "./anilist-creators";
import { syncTmdbSeriesCreators } from "./tmdb-series-creators";
import { getImportedCreatorNameLocalization } from "./creator-name-import";
import { enqueueCreatorImageFill } from "./creator-image-jobs";
import { tmdbPersonNameCandidateQuery, tmdbPersonAliasCandidateQuery } from "./tmdb-person-identity";
import { syncTmdbFilmDirectors } from "./tmdb-directors";
import { isTmdbPersonId } from "@/lib/creators/tmdb-directors";
import { syncTmdbFilmCompanies } from "./tmdb-companies";
import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { getWorkingBookPublishers } from "./book-publisher-roster";
import { syncFantlabBookContributors, syncBookPublisherContributors, resolveFantlabBookRequest, removeFantlabBookBinding } from "./book-contributors";
import { clearDeletedEntitySnapshotLinks } from "@/db/queries/provider-snapshots";
import { getSavedBookBundle, isBookSnapshotProvider } from "@/lib/providers/book-service";
import type { ProviderContributor } from "@/lib/providers/types";
import { gameCompanyRequestKey, syncGameCompanyCreators, resolveGameCompanyRequest, removeGameCompanyBinding, getGameCompanyRosterBatch } from "./game-companies";
import { isGameCompanyProvider } from "@/lib/creators/game-companies";
import { syncBggCreators, resolveBggCreatorRequest, removeBggBinding } from "./bgg-creators";
import { appendDomainEvent } from "@/lib/domain-events/persistence";
import { createJobRun } from "@/db/queries/jobs";
import { PROVIDER_SNAPSHOT_JOB_TYPE } from "@/lib/providers/snapshot-job-payload";
import { and, asc, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { adminActivityLogs, creators, creatorTypes, creatorRoles, creatorSeries, creatorRequests, creatorRequestMediaItems, creatorLogoCandidates, providerCreatorMappings, providerCreatorBindings, providerCreatorExclusions, entryCreators, entryCreatorSources, mediaItems, mediaItemMetadata, gameCompanyRosters, jobRuns } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";
import { normalizeSearchSql } from "@/db/search";
import { extractExternalCreators, extractFantlabCreatorReferences } from "@/lib/media/creators";
import { pruneEntryCreators, type CreatorTransaction } from "./creators";
const isOrganizationProvider = (provider: unknown) => provider === "tmdb" || provider === "anilist" || isGameCompanyProvider(provider);
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
    const [created] = await tx.insert(creators).values({ id: next.id, name: name.trim(), ...getImportedCreatorNameLocalization({ name }), slug: `creator-${next.id}`, typeId: type.id }).returning();
    await enqueueCreatorImageFill(tx, created.id);
    return created;
}
/** Lock media item first, then request keys in lexical order. Never lock items in decision transactions. */
export async function syncProviderCreators(tx: CreatorTransaction, input: {
    mediaItemId: number;
    provider: string | null;
    mediaType: string;
    facts: Record<string, unknown>;
    contributors?: ProviderContributor[];
    autoApprove?: boolean;
}) {
    if (input.provider === "anilist" && input.mediaType === "anime") return syncAniListCreators(tx, input.mediaItemId);
    if (input.provider === "tmdb" && input.mediaType === "series") {
      return syncTmdbSeriesCreators(tx, input.mediaItemId);
    }
    if (input.provider === "tmdb" && input.mediaType === "film") {
      const result = await syncTmdbFilmCompanies(tx, input.mediaItemId);
      await syncTmdbFilmDirectors(tx, input.mediaItemId);
      return result;
    }
    if (isGameCompanyProvider(input.provider) && input.mediaType === "game") return syncGameCompanyCreators(tx, input.mediaItemId, input.provider, input.facts);
    if (input.provider === "bgg" && input.mediaType === "boardgame") return syncBggCreators(tx, input.mediaItemId, input.facts);
    if (input.provider === "fantlab" && input.mediaType === "book" && input.contributors) return syncFantlabBookContributors(tx, input.mediaItemId, input.contributors);
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
        const initialBindings = externalIds.length ? await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true), inArray(providerCreatorBindings.externalCreatorId, externalIds))) : [];
        const creatorIds = [...new Set(initialBindings.map(value => value.creatorId))].sort((a, b) => a - b);
        if (creatorIds.length) await tx.select({ id: creators.id }).from(creators).where(inArray(creators.id, creatorIds)).orderBy(asc(creators.id)).for("update");
        const currentBindings = externalIds.length ? await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true), inArray(providerCreatorBindings.externalCreatorId, externalIds))) : [];
        const resolved = references.map(reference => ({ reference, binding: currentBindings.find(value => value.externalCreatorId === reference.id && creatorIds.includes(value.creatorId)) }));
        // Incomplete identity migration must never erase the populated archive's old provenance.
        const complete = resolved.every(value => value.binding || suppressed.has(value.reference.normalizedName));
        if (complete) {
            await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId, input.mediaItemId), input.provider ? eq(entryCreatorSources.provider, input.provider) : undefined));
            await tx.delete(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.mediaItemId, input.mediaItemId), input.provider ? sql`${creatorRequestMediaItems.requestId} in (select id from creator_requests where provider=${input.provider})` : undefined));
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
    const contributorKeys = new Set<string>();
    const external = (input.contributors ? input.contributors.map(value=>({...value,normalizedName:normalizeSearchText(value.name)}))
      : (input.mediaType === "book" && input.provider ? extractExternalCreators(input.facts) : []).map((value,position)=>({...value,roleCode:"writer" as const,position}))).filter(value=>{
        const key=`${value.roleCode}:${value.normalizedName}`;
        if (!value.normalizedName || contributorKeys.has(key)) return false;
        contributorKeys.add(key);return true;
      });
    await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId, input.mediaItemId), input.provider ? eq(entryCreatorSources.provider, input.provider) : undefined));
    await tx.delete(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.mediaItemId, input.mediaItemId), input.provider ? sql`${creatorRequestMediaItems.requestId} in (select id from creator_requests where provider=${input.provider})` : undefined));
    let createdCreators = 0, createdMappings = 0, createdLinks = 0;
    const roles = external.length ? await tx.select().from(creatorRoles).where(inArray(creatorRoles.code,[...new Set(external.map(value=>value.roleCode))])) : [];
    for (const value of [...external].sort((a, b) => a.normalizedName.localeCompare(b.normalizedName))) {
        const provider = input.provider!;
        const role = roles.find(role=>role.code===value.roleCode);
        if (!role) throw new Error("Роль создателя не настроена.");
        const [detected] = await tx.insert(creatorRequests).values({ provider, mediaType: input.mediaType, externalCreatorName: value.name, normalizedExternalCreatorName: value.normalizedName }).onConflictDoNothing().returning();
        const [request] = await tx.select().from(creatorRequests).where(key(provider, input.mediaType, value.normalizedName)).for("update");
        if (detected)
            await activity(tx, "creator-request.detected", request.id, value.name, "Обнаружен неизвестный создатель записи.", undefined, { mediaItemId: input.mediaItemId, provider });
        await tx.insert(creatorRequestMediaItems).values({ requestId: request.id, mediaItemId: input.mediaItemId, roleId: role!.id, externalCreatorName: value.name, sourcePosition:value.position });
        await tx.update(creatorRequests).set({ lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
        const mappingKey = and(eq(providerCreatorMappings.provider, provider), eq(providerCreatorMappings.mediaType, input.mediaType), eq(providerCreatorMappings.normalizedExternalCreatorName, value.normalizedName));
        let [mapping] = await tx.select().from(providerCreatorMappings).where(mappingKey);
        const [excluded] = await tx.select().from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, provider), eq(providerCreatorExclusions.mediaType, input.mediaType), eq(providerCreatorExclusions.normalizedExternalCreatorName, value.normalizedName)));
        if (!mapping && !excluded && input.autoApprove && value.roleCode === "writer" && !request.manuallyReopened && request.decision === null && request.applyStatus === "pending") {
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
        if (mapping && !excluded && !(request.decision === null && request.manuallyReopened) && request.decision !== "exclude") {
            const [added] = await tx.insert(entryCreators).values({ entryId: input.mediaItemId, creatorId: mapping.creatorId, roleId: role!.id }).onConflictDoNothing().returning();
            if (added)
                createdLinks++;
            await tx.insert(entryCreatorSources).values({ entryId: input.mediaItemId, creatorId: mapping.creatorId, roleId: role!.id, provider, normalizedExternalCreatorName: value.normalizedName, sourcePosition:value.position }).onConflictDoNothing();
        }
    }
    await pruneEntryCreators(tx, input.mediaItemId);
    return { createdCreators, createdMappings, createdLinks };
}
const statusSql = sql<"pending" | "applying" | "processed" | "failed"> `case when ${jobRuns.status} in ('queued','running') then 'applying' when ${jobRuns.status} in ('failed','cancelled') then 'failed' when ${jobRuns.status}='succeeded' then case when ${creatorRequests.decision} is null then 'pending' else 'processed' end else ${creatorRequests.applyStatus} end`;
const hasCreatorRequestEntriesSql = sql<boolean>`exists (select 1 from ${creatorRequestMediaItems} o where o.request_id=${creatorRequests.id})`;
const hasLogoCandidatesSql = sql<boolean>`exists (select 1 from ${creatorLogoCandidates} l where l.request_id=${creatorRequests.id})`;
function legacyLogoIgnoreCondition(hasEntries: SQL, hasCandidates: SQL, bulk = false) {
    const excluded = bulk
      ? sql`${creatorRequests.externalCreatorId} in (select e.external_creator_id from ${providerCreatorExclusions} e where e.provider='tmdb' and e.media_type='anime' and e.external_creator_id is not null)`
      : sql`exists (select 1 from ${providerCreatorExclusions} e where e.provider='tmdb' and e.external_creator_id=${creatorRequests.externalCreatorId} and e.media_type='anime')`;
    return sql<boolean>`(${creatorRequests.provider}='tmdb' and ${creatorRequests.mediaType}='anime'
      and ${creatorRequests.externalCreatorId} like 'company:%' and ${creatorRequests.decision}='exclude'
      and ${hasCandidates} and not ${hasEntries}
      and ${excluded})`;
}
export const legacyLogoIgnoreSql = legacyLogoIgnoreCondition(hasCreatorRequestEntriesSql, hasLogoCandidatesSql);
const bulkHasEntriesSql = sql<boolean>`${creatorRequests.id} in (select distinct o.request_id from ${creatorRequestMediaItems} o)`;
const bulkHasCandidatesSql = sql<boolean>`${creatorRequests.id} in (select l.request_id from ${creatorLogoCandidates} l)`;
const bulkHasPendingCandidatesSql = sql<boolean>`${creatorRequests.id} in (select l.request_id from ${creatorLogoCandidates} l where l.decision is null)`;
function pendingCreatorRequestCondition(hasEntries: SQL, hasCandidates: SQL, hasPendingCandidates: SQL, legacyIgnore: SQL) {
    return or(and(isNull(creatorRequests.decision), or(hasEntries, sql`not (${hasCandidates})`, hasPendingCandidates)), legacyIgnore);
}
export function getCreatorRequestsQuery(input: { all?: boolean; requestId?: number; requestIds?: number[] } = {}) {
    const requestScope = input.requestId ? eq(creatorRequests.id, input.requestId) : input.requestIds ? inArray(creatorRequests.id, input.requestIds) : undefined;
    const logoScope = input.requestId ? eq(creatorLogoCandidates.requestId, input.requestId) : input.requestIds ? inArray(creatorLogoCandidates.requestId, input.requestIds) : undefined;
    const occurrenceScope = input.requestId ? eq(creatorRequestMediaItems.requestId, input.requestId) : input.requestIds ? inArray(creatorRequestMediaItems.requestId, input.requestIds) : undefined;
    // Aggregate pairs once for a queue; push the key into this aggregation for a detail page.
    const logos = db.select({ requestId: creatorLogoCandidates.requestId,
      total: sql<number>`count(*)::int`.as("total"), pending: sql<number>`count(*) filter (where ${creatorLogoCandidates.decision} is null)::int`.as("pending"),
    }).from(creatorLogoCandidates).where(logoScope).groupBy(creatorLogoCandidates.requestId).as("logo_summary");
    const occurrences = db.select({ requestId: creatorRequestMediaItems.requestId,
      count: sql<number>`count(distinct ${creatorRequestMediaItems.mediaItemId})::int`.as("entry_count"),
      roles: sql<string[]>`jsonb_agg(distinct ${creatorRoles.name})`.as("roles"),
    }).from(creatorRequestMediaItems).innerJoin(creatorRoles, eq(creatorRoles.id, creatorRequestMediaItems.roleId))
      .where(occurrenceScope).groupBy(creatorRequestMediaItems.requestId).as("occurrence_summary");
    const hasEntries = sql<boolean>`coalesce(${occurrences.count},0)>0`;
    const hasCandidates = sql<boolean>`coalesce(${logos.total},0)>0`;
    const hasPendingCandidates = sql<boolean>`coalesce(${logos.pending},0)>0`;
    const legacyIgnore = legacyLogoIgnoreCondition(hasEntries, hasCandidates, !input.requestId && !input.requestIds);
    return db.select({ id: creatorRequests.id, provider: creatorRequests.provider, externalCreatorId: creatorRequests.externalCreatorId, roles: sql<string[]>`coalesce(${occurrences.roles}, '[]'::jsonb)`, mediaType: creatorRequests.mediaType, externalCreatorName: creatorRequests.externalCreatorName, normalizedExternalCreatorName: creatorRequests.normalizedExternalCreatorName, decision: creatorRequests.decision, status: statusSql, jobRunId: creatorRequests.jobRunId, jobError: sql<string | null> `coalesce(${jobRuns.errorMessage},${creatorRequests.jobError})`, firstSeenAt: creatorRequests.firstSeenAt, occurrenceCount: sql<number>`coalesce(${occurrences.count},0)`,
      logoCandidateCount: sql<number>`coalesce(${logos.total},0)`, pendingLogoCandidateCount: sql<number>`coalesce(${logos.pending},0)`, legacyLogoIgnore: legacyIgnore,
    }).from(creatorRequests).leftJoin(jobRuns, eq(jobRuns.id, creatorRequests.jobRunId)).leftJoin(logos, eq(logos.requestId, creatorRequests.id)).leftJoin(occurrences, eq(occurrences.requestId, creatorRequests.id))
      .where(and(input.all ? undefined : pendingCreatorRequestCondition(hasEntries, hasCandidates, hasPendingCandidates, legacyIgnore), requestScope))
      .orderBy(asc(creatorRequests.firstSeenAt), asc(creatorRequests.id));
}
export async function getCreatorRequests(input: Parameters<typeof getCreatorRequestsQuery>[0] = {}) { return getCreatorRequestsQuery(input); }

const creatorRequestQueueCondition = pendingCreatorRequestCondition(bulkHasEntriesSql, bulkHasCandidatesSql, bulkHasPendingCandidatesSql, legacyLogoIgnoreCondition(bulkHasEntriesSql, bulkHasCandidatesSql, true));
export function getCreatorRequestsPageIdsQuery(input: { all?: boolean; page: number; pageSize: number }) {
    return db.select({ id: creatorRequests.id }).from(creatorRequests).where(input.all ? undefined : creatorRequestQueueCondition)
        .orderBy(asc(creatorRequests.firstSeenAt), asc(creatorRequests.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
}
export function getCreatorRequestsCountQuery(input: { all?: boolean } = {}) {
    return db.select({ count: sql<number>`count(*)::int` }).from(creatorRequests).where(input.all ? undefined : creatorRequestQueueCondition);
}
export async function getCreatorRequestsPage(input: { all?: boolean; page?: number } = {}) {
    const pageSize = 30;
    const [count] = await getCreatorRequestsCountQuery(input);
    const totalCount = count.count;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const requestedPage = input.page ?? 1;
    const page = Math.min(totalPages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
    const ids = totalCount ? await getCreatorRequestsPageIdsQuery({ all: input.all, page, pageSize }) : [];
    // LIMIT applies to lightweight request identities before roles, participation or logo aggregates.
    const items = ids.length ? await getCreatorRequestsQuery({ all: true, requestIds: ids.map(row => row.id) }) : [];
    return { items, totalCount, page, pageSize, totalPages };
}
export async function getCreatorExclusions() {
    return db.select().from(providerCreatorExclusions).orderBy(asc(providerCreatorExclusions.externalCreatorName));
}
export async function getPendingCreatorRequestCount() {
    const [row] = await getPendingCreatorRequestCountQuery();
    return row.count;
}
export function getPendingCreatorRequestCountQuery() {
    return getCreatorRequestsCountQuery();
}
async function assertIdle(tx: CreatorTransaction, request: typeof creatorRequests.$inferSelect) {
    const [run] = request.jobRunId ? await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId)) : [];
    if (run ? ["queued", "running"].includes(run.status) : request.applyStatus === "applying")
        throw new CreatorRequestError("applying", "Дождитесь завершения текущей задачи.");
}
/** Reject only the search suggestion. The provider identity and its real roster are untouched. */
export async function rejectAnimeCompanyLogoCandidate(input: { requestId: number; creatorId: number; adminId?: number }) {
    return db.transaction(async tx => {
        const [request] = await tx.select().from(creatorRequests).where(eq(creatorRequests.id, input.requestId)).for("update");
        if (!request) throw new CreatorRequestError("not-found", "Заявка не найдена.");
        if (request.provider !== "tmdb" || !request.externalCreatorId?.startsWith("company:")) throw new CreatorRequestError("logo-candidate", "Это не кандидат для поиска логотипа.");
        await assertIdle(tx, request);
        const [candidate] = await tx.select().from(creatorLogoCandidates).where(and(eq(creatorLogoCandidates.requestId, request.id), eq(creatorLogoCandidates.creatorId, input.creatorId))).for("update");
        if (!candidate || candidate.decision === "map") throw new CreatorRequestError("logo-candidate", "Совпадение не найдено или уже подтверждено.");
        if (candidate.decision === "reject") return;
        await tx.update(creatorLogoCandidates).set({ decision: "reject", resolvedByAdminId: input.adminId ?? null, resolvedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(creatorLogoCandidates.requestId, request.id), eq(creatorLogoCandidates.creatorId, input.creatorId)));
        await activity(tx, "creator-request.resolved", request.id, request.externalCreatorName, "Отклонено совпадение организаций при поиске логотипа. Общий игнор не изменён.", input.adminId,
            { scope: "logo-candidate", decision: "reject", creatorId: input.creatorId, externalCreatorId: request.externalCreatorId });
    });
}

/** Explicit remediation only. Migration never guesses whether a legacy global ignore was intentional. */
export async function repairLegacyAnimeCompanyLogoIgnore(input: { requestId: number; adminId: number }) {
    return db.transaction(async tx => {
        const [request] = await tx.select().from(creatorRequests).where(eq(creatorRequests.id, input.requestId)).for("update");
        if (!request) throw new CreatorRequestError("not-found", "Заявка не найдена.");
        await assertIdle(tx, request);
        const [legacy] = await tx.select({ id: creatorRequests.id }).from(creatorRequests).where(and(eq(creatorRequests.id, request.id), legacyLogoIgnoreSql));
        if (!legacy) throw new CreatorRequestError("logo-candidate", "Общий игнор нельзя заменить автоматически: проверьте связанные записи и решения.");
        await tx.update(creatorLogoCandidates).set({ decision: "reject", resolvedByAdminId: input.adminId, resolvedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(creatorLogoCandidates.requestId, request.id), isNull(creatorLogoCandidates.decision)));
        await tx.delete(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, "tmdb"), eq(providerCreatorExclusions.externalCreatorId, request.externalCreatorId!), eq(providerCreatorExclusions.mediaType, "anime")));
        await tx.update(creatorRequests).set({ decision: null, resolvedByAdminId: null, resolvedAt: null, jobRunId: null, applyStatus: "pending", jobError: null, manuallyReopened: false, updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
        await activity(tx, "creator-request.resolved", request.id, request.externalCreatorName, "Прежний общий игнор компании заменён отклонением совпадений для логотипа.", input.adminId,
            { scope: "logo-candidate-repair", previousJobRunId: request.jobRunId, externalCreatorId: request.externalCreatorId });
    });
}
async function enqueue(tx: CreatorTransaction, requestId: number, adminId?: number, orphanCreatorId?: number) {
    const now = new Date();
    const [run] = await tx.insert(jobRuns).values({ type: CREATOR_REQUEST_JOB_TYPE, payload: { requestId, ...(orphanCreatorId ? { orphanCreatorId } : {}) }, source: adminId ? "manual" : "event", createdByAdminId: adminId, scheduledFor: now, availableAt: now, maxAttempts: 3, timeoutSeconds: 900, retryBaseSeconds: 60, retryMaxSeconds: 3600 }).returning({ id: jobRuns.id });
    await tx.update(creatorRequests).set({ jobRunId: run.id, applyStatus: "applying", jobError: null, updatedAt: now }).where(eq(creatorRequests.id, requestId));
    return { requestId, jobRunId: run.id };
}
export async function resolveCreatorRequest(input: {
    animeCompanyLogoEvidence?: AnimeCompanyLogoEvidence;
    logoCandidateCreatorId?: number;
    requestId: number;
    jobGuard?: SnapshotJobGuard;
    adminId?: number;
    autoApprove?: boolean;
    decision: "create" | "map" | "exclude";
    creatorId?: number;
    name?: string;
    typeCode?: "person" | "collective" | "organization";
}) {
    return withSnapshotJobGuard(input.jobGuard, async (tx) => {
        if (!["create", "map", "exclude"].includes(input.decision))
            throw new CreatorRequestError("invalid-decision", "Неизвестное решение.");
        const [request] = await tx.select().from(creatorRequests).where(eq(creatorRequests.id, input.requestId)).for("update");
        if (!request)
            throw new CreatorRequestError("not-found", "Заявка не найдена.");
        if (input.animeCompanyLogoEvidence && (!input.autoApprove || request.provider !== "tmdb" || request.mediaType !== "anime" || !request.externalCreatorId?.startsWith("company:"))) throw new CreatorRequestError("auto-skip", "Некорректное основание привязки логотипа.");
        await assertIdle(tx, request);
        if (request.decision !== null)
            throw new CreatorRequestError("already-resolved", "Решение уже принято.");
        const pairCreatorId = input.animeCompanyLogoEvidence?.creatorId ?? input.logoCandidateCreatorId;
        if (pairCreatorId !== undefined) {
            if (request.provider !== "tmdb" || !request.externalCreatorId?.startsWith("company:") || input.decision !== "map" || input.creatorId !== pairCreatorId)
                throw new CreatorRequestError("logo-candidate", "Некорректное решение по совпадению организаций.");
            const [candidate] = await tx.select().from(creatorLogoCandidates).where(and(eq(creatorLogoCandidates.requestId, request.id), eq(creatorLogoCandidates.creatorId, pairCreatorId)));
            if (!candidate || candidate.decision !== null) throw new CreatorRequestError(input.autoApprove ? "auto-skip" : "logo-candidate", "Совпадение уже отклонено или не найдено.");
            const [creator] = await tx.select({ id: creators.id, type: creatorTypes.code, name: creators.name, originalName: creators.originalName }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, pairCreatorId)).for("update", { of: creators });
            if (creator?.type !== "organization") throw new CreatorRequestError(input.autoApprove ? "auto-skip" : "invalid-type", "Выберите организацию.");
            // Creator first, then pair: creator deletion cascades to the pair table.
            const [lockedCandidate] = await tx.select().from(creatorLogoCandidates).where(and(eq(creatorLogoCandidates.requestId, request.id), eq(creatorLogoCandidates.creatorId, pairCreatorId))).for("update");
            if (!lockedCandidate || lockedCandidate.decision !== null) throw new CreatorRequestError(input.autoApprove ? "auto-skip" : "logo-candidate", "Совпадение уже изменено.");
            const [source] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "anilist"), eq(providerCreatorBindings.externalCreatorId, candidate.anilistStudioId), eq(providerCreatorBindings.creatorId, pairCreatorId), eq(providerCreatorBindings.active, true))).for("share");
            if (!source || !await animeCompanyLogoSourceAllowed(source, animeCompanyLogoSourceName(creator), tx)) throw new CreatorRequestError(input.autoApprove ? "auto-skip" : "logo-candidate", "Исходная студия больше не доступна для сопоставления.");
            const [owner] = await tx.select({ id: providerCreatorBindings.id, creatorId: providerCreatorBindings.creatorId }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "tmdb"), eq(providerCreatorBindings.externalCreatorId, request.externalCreatorId), eq(providerCreatorBindings.active, true)));
            const [conflict] = await tx.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "tmdb"), eq(providerCreatorBindings.creatorId, pairCreatorId), eq(providerCreatorBindings.active, true), sql`${providerCreatorBindings.externalCreatorId} like 'company:%'`, sql`${providerCreatorBindings.externalCreatorId} <> ${request.externalCreatorId}`)).limit(1);
            if ((owner && owner.creatorId !== pairCreatorId) || conflict) throw new CreatorRequestError(input.autoApprove ? "auto-skip" : "identity-conflict", "У организации уже есть другая привязка TMDB.");
            const [excluded] = await tx.select({ id: providerCreatorExclusions.id }).from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, "tmdb"), or(eq(providerCreatorExclusions.externalCreatorId, request.externalCreatorId), and(isNull(providerCreatorExclusions.externalCreatorId), eq(providerCreatorExclusions.mediaType, request.mediaType), eq(providerCreatorExclusions.normalizedExternalCreatorName, request.normalizedExternalCreatorName))))).limit(1);
            if (excluded) throw new CreatorRequestError(input.autoApprove ? "auto-skip" : "logo-candidate", "Компания находится в общем игноре. Сначала проверьте это решение отдельно.");
        } else if (request.provider === "tmdb" && request.externalCreatorId?.startsWith("company:")) {
            const [logoOnly] = await tx.select({ id: creatorRequests.id }).from(creatorRequests).where(and(eq(creatorRequests.id, request.id), hasLogoCandidatesSql, sql`not ${hasCreatorRequestEntriesSql}`));
            if (logoOnly) throw new CreatorRequestError("logo-only", "Для поиска логотипа нужно принять решение по конкретной паре организаций.");
        }
        if (input.autoApprove && ((request.provider !== "bgg" && !isOrganizationProvider(request.provider)) || request.externalCreatorId === null || request.manuallyReopened || request.applyStatus !== "pending")) {
            throw new CreatorRequestError("auto-skip", "Заявка требует ручного решения.");
        }
        if (((request.provider === "tmdb" && isTmdbPersonId(request.externalCreatorId)) || (request.provider === "anilist" && isAniListPersonId(request.externalCreatorId)))) {
            const resolvedInput = { ...input };
            const externalId = request.externalCreatorId;
            const [binding] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, request.provider), eq(providerCreatorBindings.externalCreatorId, externalId), eq(providerCreatorBindings.active, true)));
            if (input.autoApprove) {
                const [excluded] = await tx.select({ id: providerCreatorExclusions.id }).from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, request.provider),
                    sql`(${providerCreatorExclusions.externalCreatorId}=${externalId} or (${providerCreatorExclusions.externalCreatorId} is null and ${providerCreatorExclusions.mediaType}=${request.mediaType} and ${providerCreatorExclusions.normalizedExternalCreatorName}=${request.normalizedExternalCreatorName}))`));
                if (excluded) throw new CreatorRequestError("auto-skip", "Персона исключена администратором.");
                const names = await tx.selectDistinct({ name: normalizeSearchSql(creatorRequestMediaItems.externalCreatorName) }).from(creatorRequestMediaItems).where(eq(creatorRequestMediaItems.requestId, request.id)).limit(2);
                if (!names.length || new Set([request.normalizedExternalCreatorName, ...names.map(row => row.name)]).size !== 1) throw new CreatorRequestError("auto-skip", "Разные варианты имени требуют проверки.");
                if (binding) {
                    resolvedInput.decision = "map";
                    resolvedInput.creatorId = binding.creatorId;
                } else {
                    const [historical] = await tx.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, request.provider), eq(providerCreatorBindings.externalCreatorId, externalId))).limit(1);
                    if (historical) throw new CreatorRequestError("auto-skip", "Прежняя привязка требует ручного решения.");
                    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator:${request.normalizedExternalCreatorName}`},0))`);
                    const [candidate] = await tmdbPersonNameCandidateQuery(request.normalizedExternalCreatorName, tx);
                    const [alias] = await tmdbPersonAliasCandidateQuery(request.normalizedExternalCreatorName, tx);
                    if (candidate || alias) throw new CreatorRequestError("auto-skip", "Совпадение имени требует ручного подтверждения идентичности.");
                    resolvedInput.decision = "create";
                    resolvedInput.name = request.externalCreatorName;
                }
            }
            if (resolvedInput.decision === "exclude") {
                await removeGameCompanyBinding(tx, request.provider, externalId);
                await tx.insert(providerCreatorExclusions).values({ provider: request.provider, mediaType: request.mediaType, externalCreatorId: externalId, externalCreatorName: request.externalCreatorName, normalizedExternalCreatorName: request.normalizedExternalCreatorName }).onConflictDoNothing();
            } else {
                let creatorId = resolvedInput.creatorId;
                if (resolvedInput.decision === "create") {
                    if (binding) throw new CreatorRequestError("identity-conflict", "ID провайдера уже связан с Creator.");
                    if (!resolvedInput.name?.trim()) throw new CreatorRequestError("invalid-name", "Укажите имя создателя.");
                    creatorId = (await createPerson(tx, resolvedInput.name)).id;
                }
                const [creator] = creatorId ? await tx.select({ id: creators.id, type: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, creatorId)).for("update", { of: creators }) : [];
                if (!creator || creator.type !== "person") throw new CreatorRequestError(input.autoApprove ? "auto-skip" : "invalid-type", "Выберите создателя типа person.");
                if (binding && binding.creatorId !== creator.id) throw new CreatorRequestError("identity-conflict", "ID провайдера уже принадлежит другому Creator.");
                const [conflict] = await tx.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, request.provider), eq(providerCreatorBindings.creatorId, creator.id), eq(providerCreatorBindings.active, true), sql`${providerCreatorBindings.externalCreatorId} like 'person:%'`, sql`${providerCreatorBindings.externalCreatorId} <> ${externalId}`)).limit(1);
                if (conflict) throw new CreatorRequestError(input.autoApprove ? "auto-skip" : "tmdb-person-conflict", "У Creator уже есть другой person ID провайдера.");
                await tx.delete(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, request.provider), eq(providerCreatorExclusions.externalCreatorId, externalId)));
                if (!binding) await tx.insert(providerCreatorBindings).values({ provider: request.provider, externalCreatorId: externalId, externalCreatorName: request.externalCreatorName, creatorId: creator.id });
                await enqueueCreatorImageFill(tx, creator.id);
            }
            await tx.update(creatorRequests).set({ decision: resolvedInput.decision, resolvedByAdminId: input.adminId, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
            const queued = await enqueue(tx, request.id, input.adminId);
            await activity(tx, "creator-request.resolved", request.id, request.externalCreatorName, "Принято решение по персоне провайдера.", input.adminId, { decision: resolvedInput.decision, automatic: input.autoApprove === true, ...queued });
            return queued;
        }
        if (request.externalCreatorId !== null && isOrganizationProvider(request.provider)) {
            const resolvedInput = { ...input };
            const logoEvidence = input.animeCompanyLogoEvidence;
            if (logoEvidence) {
                if (!await validateAnimeCompanyLogoEvidence(tx, request, logoEvidence)) throw new CreatorRequestError("auto-skip", "Совпадение компании требует ручного подтверждения.");
                resolvedInput.decision = "map";
                resolvedInput.creatorId = logoEvidence.creatorId;
            }
            if ((request.provider === "tmdb" || request.provider === "anilist") && input.autoApprove && !logoEvidence) {
                const [excluded] = await tx.select({ id: providerCreatorExclusions.id }).from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, request.provider),
                  sql`(${providerCreatorExclusions.externalCreatorId}=${request.externalCreatorId} or (${providerCreatorExclusions.externalCreatorId} is null and ${providerCreatorExclusions.mediaType}=${request.mediaType} and ${providerCreatorExclusions.normalizedExternalCreatorName}=${request.normalizedExternalCreatorName}))`));
                if (excluded) throw new CreatorRequestError("auto-skip", "Компания исключена администратором.");
                const observations = await tx.selectDistinct({ name: normalizeSearchSql(creatorRequestMediaItems.externalCreatorName) }).from(creatorRequestMediaItems).where(eq(creatorRequestMediaItems.requestId, request.id)).limit(2);
                if (!observations.length || new Set([request.normalizedExternalCreatorName, ...observations.map(row => row.name)]).size !== 1)
                    throw new CreatorRequestError("auto-skip", "Разные варианты названия требуют проверки.");
            }
            if (input.autoApprove && !logoEvidence) {
                const [confirmed] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, request.provider), eq(providerCreatorBindings.externalCreatorId, request.externalCreatorId), eq(providerCreatorBindings.active, true)));
                if (confirmed) {
                    if ((request.provider === "tmdb" || request.provider === "anilist")) {
                        const [owner] = await tx.select({ type: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, confirmed.creatorId));
                        if (owner?.type !== "organization") throw new CreatorRequestError("auto-skip", "Привязка ведёт не к организации.");
                    }
                    resolvedInput.decision = "map";
                    resolvedInput.creatorId = confirmed.creatorId;
                } else {
                    if ((request.provider !== "tmdb" && request.provider !== "anilist")) {
                        const names = await tx.select({ name: creatorRequestMediaItems.externalCreatorName }).from(creatorRequestMediaItems).where(eq(creatorRequestMediaItems.requestId, request.id));
                        if (new Set([request.normalizedExternalCreatorName, ...names.map(row => normalizeSearchText(row.name))]).size !== 1) throw new CreatorRequestError("auto-skip", "Разные варианты названия требуют проверки.");
                    }
                    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator:${request.normalizedExternalCreatorName}`},0))`);
                    if ((request.provider === "tmdb" || request.provider === "anilist")) {
                        const [historical] = await tx.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, request.provider), eq(providerCreatorBindings.externalCreatorId, request.externalCreatorId))).limit(1);
                        if (historical) throw new CreatorRequestError("auto-skip", "Прежняя привязка требует ручного решения.");
                    }
                    const savedMappings = (request.provider === "tmdb" || request.provider === "anilist") ? await tx.select({ creatorId: providerCreatorMappings.creatorId }).from(providerCreatorMappings).where(and(
                        eq(providerCreatorMappings.provider, request.provider), request.externalCreatorId.startsWith("network:") ? undefined : eq(providerCreatorMappings.mediaType, request.mediaType), eq(providerCreatorMappings.normalizedExternalCreatorName, request.normalizedExternalCreatorName),
                    )) : [];
                    const candidates = await tx.select({ id: creators.id }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(and(
                        eq(creatorTypes.code, "organization"), or(
                            sql`btrim(${normalizeSearchSql(creators.name)})=${request.normalizedExternalCreatorName}`,
                            sql`btrim(${normalizeSearchSql(creators.originalName)})=${request.normalizedExternalCreatorName}`,
                            savedMappings.length ? inArray(creators.id, savedMappings.map(row => row.creatorId)) : undefined,
                        ),
                    )).limit(2);
                    if (savedMappings.some(mapping => !candidates.some(candidate => candidate.id === mapping.creatorId))) throw new CreatorRequestError("auto-skip", "Сохранённое сопоставление требует проверки организации.");
                    if (candidates.length > 1) throw new CreatorRequestError("auto-skip", "Неоднозначное название организации.");
                    if (candidates.length === 1) {
                        // Distinct IDs in one API namespace may be homonymous companies.
                        // RAWG developer and publisher are separate namespaces and may share a Creator.
                        const namespace = request.externalCreatorId.split(":")[0];
                        const [conflict] = await tx.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(
                            eq(providerCreatorBindings.creatorId, candidates[0].id), eq(providerCreatorBindings.provider, request.provider), eq(providerCreatorBindings.active, true),
                            sql`split_part(${providerCreatorBindings.externalCreatorId}, ':', 1)=${namespace}`,
                            sql`${providerCreatorBindings.externalCreatorId} <> ${request.externalCreatorId}`,
                        )).limit(1);
                        if (conflict) throw new CreatorRequestError("auto-skip", "У организации уже есть другой ID в этом пространстве провайдера.");
                        resolvedInput.decision = "map";
                        resolvedInput.creatorId = candidates[0].id;
                    } else {
                        resolvedInput.decision = "create";
                        resolvedInput.name = request.externalCreatorName;
                        resolvedInput.typeCode = "organization";
                    }
                }
            }
            await resolveGameCompanyRequest(tx, request, resolvedInput);
            if (pairCreatorId !== undefined) await tx.update(creatorLogoCandidates).set({ decision: "map", resolvedByAdminId: input.adminId, resolvedAt: new Date(), updatedAt: new Date() }).where(and(eq(creatorLogoCandidates.requestId, request.id), eq(creatorLogoCandidates.creatorId, pairCreatorId)));
            await tx.update(creatorRequests).set({ decision: resolvedInput.decision, resolvedByAdminId: input.adminId, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
            const queued = await enqueue(tx, request.id, input.adminId);
            await activity(tx, "creator-request.resolved", request.id, request.externalCreatorName, "Принято решение по организации.", input.adminId, { decision: resolvedInput.decision, automatic: input.autoApprove === true, ...queued });
            return queued;
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
            await resolveBggCreatorRequest(tx, request, { ...resolvedInput, typeCode: resolvedInput.typeCode === "organization" ? undefined : resolvedInput.typeCode });
            await tx.update(creatorRequests).set({ decision: resolvedInput.decision, resolvedByAdminId: input.adminId, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
            const queued = await enqueue(tx, request.id, input.adminId);
            await activity(tx, "creator-request.resolved", request.id, request.externalCreatorName, "Принято решение по BGG ID.", input.adminId, { decision: resolvedInput.decision, automatic: input.autoApprove === true, ...queued });
            return queued;
        }
        if (request.provider === "fantlab" && request.externalCreatorId !== null) {
            await resolveFantlabBookRequest(tx, request, input);
            if (input.decision !== "exclude") {
                const [binding] = await tx.select({ creatorId: providerCreatorBindings.creatorId }).from(providerCreatorBindings)
                    .where(and(eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.externalCreatorId, request.externalCreatorId), eq(providerCreatorBindings.active, true)));
                if (!binding) throw new Error("CREATOR_BINDING_MISSING");
                await createJobRun({ type: PROVIDER_SNAPSHOT_JOB_TYPE, source: input.adminId ? "manual" : "event", createdByAdminId: input.adminId,
                    payload: { entityType: "creator", creatorIds: [binding.creatorId], provider: "fantlab", operation: "refresh-process" },
                    maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
            }
            await tx.update(creatorRequests).set({ decision: input.decision, resolvedByAdminId: input.adminId, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
            const queued = await enqueue(tx, request.id, input.adminId);
            await activity(tx, "creator-request.resolved", request.id, request.externalCreatorName, "Принято решение по автору FantLab.", input.adminId, {decision:input.decision,...queued});
            return queued;
        }
        const requestRoles = await tx.select({code:creatorRoles.code}).from(creatorRequestMediaItems).innerJoin(creatorRoles,eq(creatorRoles.id,creatorRequestMediaItems.roleId)).where(eq(creatorRequestMediaItems.requestId,request.id));
        const publisherOnly = requestRoles.length > 0 && requestRoles.every(value=>value.code === "publisher");
        let creatorId = input.creatorId;
        if (input.decision === "create") {
            if (!input.name?.trim())
                throw new CreatorRequestError("invalid-name", "Укажите имя.");
            if (publisherOnly) {
                const [type]=await tx.select().from(creatorTypes).where(eq(creatorTypes.code,"organization"));
                if(!type) throw new CreatorRequestError("invalid-type","Тип organization не настроен.");
                const [next]=await tx.execute<{id:number}>(sql`select nextval(pg_get_serial_sequence('creators','id'))::int id`);
                const [created]=await tx.insert(creators).values({id:next.id,name:input.name.trim(),slug:`creator-${next.id}`,typeId:type.id}).returning({id:creators.id});
                creatorId=created.id;
                await enqueueCreatorImageFill(tx, created.id);
            } else creatorId = (await createPerson(tx, input.name)).id;
        }
        if (input.decision === "map") {
            const [creator] = creatorId ? await tx.select({ code: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, creatorId)) : [];
            if (!creator || creator.code !== (publisherOnly ? "organization" : "person"))
                throw new CreatorRequestError("invalid-creator", publisherOnly ? "Выберите издателя типа organization." : "Выберите создателя типа person.");
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
        const [request] = await tx.select().from(creatorRequests).where(externalCreatorId ? gameCompanyRequestKey(value.provider, externalCreatorId) : key(value.provider, value.mediaType, value.normalizedExternalCreatorName)).for("update");
        await assertIdle(tx, request);
        if (externalCreatorId) {
            if (isOrganizationProvider(value.provider)) await removeGameCompanyBinding(tx, value.provider, externalCreatorId);
            else if (value.provider === "fantlab") await removeFantlabBookBinding(tx, externalCreatorId);
            else await removeBggBinding(tx, externalCreatorId);
        }
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
    jobGuard?: SnapshotJobGuard;
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
            const company = isGameCompanyProvider(request.provider) && request.externalCreatorId !== null;
            const items = company
                ? (await getGameCompanyRosterBatch(request.provider, request.externalCreatorId!, afterId)).map(row => ({ id: row.mediaItemId }))
                : request.decision === null && request.provider !== "tmdb" && request.provider !== "anilist"
                ? await db.select({ id: mediaItems.id }).from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(and(eq(mediaItems.mediaType, request.mediaType), eq(mediaItemMetadata.sourceProvider, request.provider), gt(mediaItems.id, afterId))).orderBy(asc(mediaItems.id)).limit(100)
                : await db.selectDistinct({ id: creatorRequestMediaItems.mediaItemId }).from(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.requestId, requestId), gt(creatorRequestMediaItems.mediaItemId, afterId))).orderBy(asc(creatorRequestMediaItems.mediaItemId)).limit(100);
            if (!items.length)
                break;
            for (const item of items) {
                input.signal?.throwIfAborted();
                const [sourceBefore] = await db.select({provider:mediaItemMetadata.sourceProvider,externalId:mediaItemMetadata.sourceExternalId}).from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId,item.id));
                if (request.mediaType === "book" && isBookSnapshotProvider(sourceBefore?.provider ?? "") && !sourceBefore?.externalId) throw new Error("PROVIDER_SNAPSHOT_REQUIRED");
                const normalizedBundle = request.mediaType === "book" && sourceBefore && isBookSnapshotProvider(sourceBefore.provider ?? "") && sourceBefore.externalId
                    ? await getSavedBookBundle(sourceBefore.provider as "fantlab"|"google-books"|"open-library",sourceBefore.externalId) : null;
                await withSnapshotJobGuard(input.jobGuard, async (tx) => {
                    const [entry] = await tx.select().from(mediaItems).where(eq(mediaItems.id, item.id)).for("update");
                    if (request.provider === "anilist" && request.externalCreatorId && entry?.mediaType === "anime") {
                        await syncAniListCreators(tx, item.id, { enqueueApproval: false });
                        return;
                    }
                    if (request.provider === "tmdb" && request.externalCreatorId && entry) {
                        const [currentSource] = await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, item.id));
                        if (entry.mediaType === "series" && currentSource?.sourceProvider === "tmdb") {
                            await syncTmdbSeriesCreators(tx, item.id, { enqueueApproval: false, enqueueLogos: false });
                        } else if (entry.mediaType === "film" && currentSource?.sourceProvider === "tmdb") {
                            if (isTmdbPersonId(request.externalCreatorId)) await syncTmdbFilmDirectors(tx, item.id, { enqueueApproval: false });
                            else await syncTmdbFilmCompanies(tx, item.id, { enqueueApproval: false, enqueueLogos: false });
                        }
                        return;
                    }
                    if (company && entry) {
                        const [roster] = await tx.select().from(gameCompanyRosters).where(and(eq(gameCompanyRosters.mediaItemId, item.id), eq(gameCompanyRosters.provider, request.provider)));
                        if (roster && isGameCompanyProvider(request.provider)) await syncGameCompanyCreators(tx, item.id, request.provider, { gameCompanyReferences: roster.references });
                        return;
                    }
                    const [metadata] = await tx.select({sourceProvider:mediaItemMetadata.sourceProvider,sourceExternalId:mediaItemMetadata.sourceExternalId,facts:normalizedBundle ? sql<Record<string,unknown>>`'{}'::jsonb` : mediaItemMetadata.facts}).from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, item.id));
                    if (!entry || !metadata)
                        return;
                    if (metadata.sourceProvider!==sourceBefore?.provider || metadata.sourceExternalId!==sourceBefore?.externalId) return;
                    if (normalizedBundle) {
                        const {lockProviderSnapshotReferences}=await import("@/db/queries/provider-snapshots");
                        await lockProviderSnapshotReferences(tx,[normalizedBundle.primary,...normalizedBundle.dependencies].map(row=>({id:row.id,payloadHash:row.payloadHash})));
                    }
                    if (request.decision === null && !normalizedBundle) {
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
                    const publishers=entry.mediaType === "book" && metadata.sourceProvider ? await getWorkingBookPublishers(tx,item.id,metadata.sourceProvider) : [];
                    if (!normalizedBundle && publishers.length && request.externalCreatorId===null && publishers.some(value=>normalizeSearchText(value.name)===request.normalizedExternalCreatorName)) {
                        await syncBookPublisherContributors(tx,item.id,metadata.sourceProvider!,publishers);
                    } else await syncProviderCreators(tx, { mediaItemId: item.id, provider: metadata.sourceProvider, mediaType: entry.mediaType, facts: normalizedBundle ? {} : metadata.facts, contributors: normalizedBundle ? [...normalizedBundle.projection.contributors,...publishers] : undefined });
                });
                afterId = item.id;
                processed++;
            }
        }
        await withSnapshotJobGuard(input.jobGuard, async tx => {
            const [current] = await tx.select().from(creatorRequests).where(eq(creatorRequests.id, requestId)).for("update");
            if (!current || (input.jobRunId && current.jobRunId !== input.jobRunId)) return;
            if (current.externalCreatorId === null && current.decision === null && typeof orphanCreatorId === "number") {
                await deleteUnlinkedCreator(tx, orphanCreatorId);
            }
            if (current.externalCreatorId && ["create", "map"].includes(current.decision ?? "")) {
                const [binding] = await tx.select({ creatorId: providerCreatorBindings.creatorId }).from(providerCreatorBindings).where(and(
                    eq(providerCreatorBindings.provider, current.provider), eq(providerCreatorBindings.externalCreatorId, current.externalCreatorId), eq(providerCreatorBindings.active, true),
                ));
                if (binding) await enqueueCreatorImageFill(tx, binding.creatorId);
            }
            await tx.update(creatorRequests).set({ applyStatus: current.decision === null ? "pending" : "processed", jobError: null, updatedAt: new Date() }).where(eq(creatorRequests.id, requestId));
        });
        return { processed };
    }
    catch (error) {
        await withSnapshotJobGuard(input.jobGuard, async tx => {
          await tx.update(creatorRequests).set({ applyStatus: "failed", jobError: "Не удалось применить решение. Подробности в журнале задачи.", updatedAt: new Date() }).where(and(eq(creatorRequests.id, requestId), input.jobRunId ? eq(creatorRequests.jobRunId, input.jobRunId) : undefined));
        });
        throw error;
    }
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
    if (deleted) await clearDeletedEntitySnapshotLinks(tx,{entityType:"creator",entityId:String(creatorId)});
    if (deleted) await tx.insert(adminActivityLogs).values({ action: "creator.deleted", actorType: "system",
        entityType: "creator", entityId: deleted.id, entityLabel: deleted.name, status: "success", severity: "info",
        message: "Создатель удалён после возврата последнего соответствия в заявки." });
    return deleted?.id ?? null;
}

export async function reopenCreatorBinding(input: { bindingId: number; adminId: number }) {
    return db.transaction(async tx => {
        const [binding] = await tx.select().from(providerCreatorBindings).where(eq(providerCreatorBindings.id, input.bindingId));
        if (!binding || !binding.active || (binding.provider !== "bgg" && binding.provider !== "fantlab" && !isOrganizationProvider(binding.provider))) throw new CreatorRequestError("not-found", "Привязка не найдена.");
        const name = binding.externalCreatorName ?? binding.externalCreatorId;
        await tx.insert(creatorRequests).values({ provider: binding.provider, externalCreatorId: binding.externalCreatorId, mediaType: binding.provider === "anilist" ? "anime" : binding.provider === "bgg" ? "boardgame" : binding.provider === "fantlab" ? "book" : binding.provider === "tmdb" ? (binding.externalCreatorId.startsWith("network:") ? "series" : "film") : "game", externalCreatorName: name, normalizedExternalCreatorName: normalizeSearchText(name) }).onConflictDoNothing();
        const [request] = await tx.select().from(creatorRequests).where(gameCompanyRequestKey(binding.provider, binding.externalCreatorId)).for("update");
        await assertIdle(tx, request);
        // Recheck the binding after request lock; a concurrent administrator may have remapped it.
        const [current] = await tx.select().from(providerCreatorBindings).where(eq(providerCreatorBindings.id, input.bindingId));
        if (!current || !current.active || current.creatorId !== binding.creatorId) throw new CreatorRequestError("changed", "Привязка уже изменилась.");
        await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, binding.creatorId)).for("update");
        if (binding.provider === "tmdb" && binding.externalCreatorId.startsWith("company:")) {
            await tx.update(creatorLogoCandidates).set({ decision: null, resolvedAt: null, resolvedByAdminId: null, updatedAt: new Date() })
                .where(and(eq(creatorLogoCandidates.requestId, request.id), eq(creatorLogoCandidates.creatorId, binding.creatorId), eq(creatorLogoCandidates.decision, "map")));
        }
        if (isOrganizationProvider(binding.provider)) await removeGameCompanyBinding(tx, binding.provider, binding.externalCreatorId);
        else if (binding.provider === "fantlab") await removeFantlabBookBinding(tx, binding.externalCreatorId);
        else { await removeBggBinding(tx, binding.externalCreatorId); await deleteUnlinkedCreator(tx, binding.creatorId); }
        await tx.update(creatorRequests).set({ decision: null, resolvedAt: null, resolvedByAdminId: null, manuallyReopened: true, updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
        const queued = await enqueue(tx, request.id, input.adminId);
        await activity(tx, "creator-mapping.reopened", request.id, name, "Внешний ID возвращён на апрув.", input.adminId, queued);
        return queued;
    });
}

/** A backfill convenience: every decision still passes through the normal approval/apply flow. */
export async function autoApproveBggCreatorRequests(mediaItemId: number, jobGuard?: SnapshotJobGuard) {
    const pending = await db.selectDistinct({ id: creatorRequests.id }).from(creatorRequests)
        .innerJoin(creatorRequestMediaItems, eq(creatorRequestMediaItems.requestId, creatorRequests.id))
        .where(and(eq(creatorRequests.provider, "bgg"), isNull(creatorRequests.decision), eq(creatorRequests.manuallyReopened, false),
            eq(creatorRequests.applyStatus, "pending"), eq(creatorRequestMediaItems.mediaItemId, mediaItemId)))
        .orderBy(asc(creatorRequests.id));
    let approved = 0, skipped = 0;
    for (const request of pending) {
        try {
            await resolveCreatorRequest({ requestId: request.id, decision: "create", autoApprove: true, jobGuard });
            approved++;
        } catch (error) {
            if (error instanceof CreatorRequestError && ["auto-skip", "already-resolved", "applying"].includes(error.code)) skipped++;
            else throw error;
        }
    }
    return { approved, skipped };
}

/** Auto approval is an ordinary request decision; existing apply jobs materialize all saved rosters. */
export async function autoApproveGameCompanyRequests(input: { provider?: "igdb" | "rawg"; externalIds?: readonly string[]; signal?: AbortSignal; jobGuard?: SnapshotJobGuard } = {}) {
    const jobGuard = input.jobGuard;
    const result = { approved: 0, skipped: 0 };
    if (input.externalIds?.length === 0) return result;
    let afterId = 0;
    for (;;) {
        input.signal?.throwIfAborted();
        const pending = await db.select({ id: creatorRequests.id }).from(creatorRequests).where(and(
            input.provider ? eq(creatorRequests.provider, input.provider) : inArray(creatorRequests.provider, ["igdb", "rawg"]),
            input.externalIds ? inArray(creatorRequests.externalCreatorId, [...input.externalIds]) : undefined,
            isNull(creatorRequests.decision), eq(creatorRequests.manuallyReopened, false), eq(creatorRequests.applyStatus, "pending"), gt(creatorRequests.id, afterId),
            sql`exists (select 1 from game_company_rosters r where r.provider=${creatorRequests.provider} and r.references @> jsonb_build_array(jsonb_build_object('externalId',${creatorRequests.externalCreatorId})))`,
        )).orderBy(asc(creatorRequests.id)).limit(100);
        if (!pending.length) break;
        for (const request of pending) {
            input.signal?.throwIfAborted();
            try {
                await resolveCreatorRequest({ requestId: request.id, decision: "create", autoApprove: true, jobGuard });
                result.approved++;
            } catch (error) {
                if (error instanceof CreatorRequestError && ["auto-skip", "already-resolved", "applying"].includes(error.code)) result.skipped++;
                else throw error;
            }
            afterId = request.id;
        }
    }
    return result;
}

/** Every automatic decision uses the standard approval transaction and apply job. */
export async function autoApproveTmdbCompanyRequests(input: { externalIds?: readonly string[]; signal?: AbortSignal; jobGuard?: SnapshotJobGuard } = {}) {
    const result = { approved: 0, skipped: 0 };
    if (input.externalIds?.length === 0) return result;
    let afterId = 0;
    for (;;) {
        const pending = await db.select({ id: creatorRequests.id }).from(creatorRequests).where(and(eq(creatorRequests.provider, "tmdb"),
            sql`(${creatorRequests.externalCreatorId} like 'company:%' or ${creatorRequests.externalCreatorId} like 'network:%')`, input.externalIds ? inArray(creatorRequests.externalCreatorId, [...input.externalIds]) : undefined,
            isNull(creatorRequests.decision), eq(creatorRequests.manuallyReopened, false), eq(creatorRequests.applyStatus, "pending"), gt(creatorRequests.id, afterId),
            sql`exists (select 1 from creator_request_media_items o where o.request_id=${creatorRequests.id})`)).orderBy(asc(creatorRequests.id)).limit(100);
        if (!pending.length) break;
        for (const request of pending) {
            input.signal?.throwIfAborted();
            try {
                await resolveCreatorRequest({ requestId: request.id, decision: "create", autoApprove: true, jobGuard: input.jobGuard });
                result.approved++;
            } catch (error) {
                if (error instanceof CreatorRequestError && ["auto-skip", "already-resolved", "applying"].includes(error.code)) result.skipped++;
                else throw error;
            }
            afterId = request.id;
        }
    }
    return result;
}

export async function autoApproveTmdbDirectorRequests(input: { externalIds?: readonly string[]; signal?: AbortSignal; jobGuard?: SnapshotJobGuard } = {}) {
    const result = { approved: 0, skipped: 0 };
    if (input.externalIds?.length === 0) return result;
    let afterId = 0;
    for (;;) {
        const pending = await db.select({ id: creatorRequests.id }).from(creatorRequests).where(and(eq(creatorRequests.provider, "tmdb"),
            sql`${creatorRequests.externalCreatorId} like 'person:%'`, input.externalIds ? inArray(creatorRequests.externalCreatorId, [...input.externalIds]) : undefined,
            isNull(creatorRequests.decision), eq(creatorRequests.manuallyReopened, false), eq(creatorRequests.applyStatus, "pending"), gt(creatorRequests.id, afterId),
            sql`exists (select 1 from creator_request_media_items o where o.request_id=${creatorRequests.id})`)).orderBy(asc(creatorRequests.id)).limit(100);
        if (!pending.length) break;
        for (const request of pending) {
            input.signal?.throwIfAborted();
            try {
                await resolveCreatorRequest({ requestId: request.id, decision: "create", autoApprove: true, jobGuard: input.jobGuard });
                result.approved++;
            } catch (error) {
                if (error instanceof CreatorRequestError && ["auto-skip", "already-resolved", "applying"].includes(error.code)) result.skipped++;
                else throw error;
            }
            afterId = request.id;
        }
    }
    return result;
}

export async function autoApproveAniListCreatorRequests(input: { externalIds?: readonly string[]; signal?: AbortSignal; jobGuard?: SnapshotJobGuard } = {}) {
    const result = { approved: 0, skipped: 0 };
    if (input.externalIds?.length === 0) return result;
    let afterId = 0;
    for (;;) {
        const pending = await db.select({ id: creatorRequests.id }).from(creatorRequests).where(and(eq(creatorRequests.provider, "anilist"),
            sql`(${creatorRequests.externalCreatorId} like 'person:%' or ${creatorRequests.externalCreatorId} like 'studio:%')`, input.externalIds ? inArray(creatorRequests.externalCreatorId, [...input.externalIds]) : undefined,
            isNull(creatorRequests.decision), eq(creatorRequests.manuallyReopened, false), eq(creatorRequests.applyStatus, "pending"), gt(creatorRequests.id, afterId),
            sql`exists (select 1 from creator_request_media_items o where o.request_id=${creatorRequests.id})`)).orderBy(asc(creatorRequests.id)).limit(100);
        if (!pending.length) break;
        for (const request of pending) {
            input.signal?.throwIfAborted();
            try {
                await resolveCreatorRequest({ requestId: request.id, decision: "create", autoApprove: true, jobGuard: input.jobGuard });
                result.approved++;
            } catch (error) {
                if (error instanceof CreatorRequestError && ["auto-skip", "already-resolved", "applying"].includes(error.code)) result.skipped++;
                else throw error;
            }
            afterId = request.id;
        }
    }
    return result;
}
