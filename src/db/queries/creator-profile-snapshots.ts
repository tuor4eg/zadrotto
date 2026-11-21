import { validateCreatorProfilePayload } from "@/lib/providers/creator-profile-fetch";
import { and, asc, eq, gt, inArray, lte, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { creators, creatorTypes, jobRuns, providerCreatorBindings, providerSnapshots, providerSnapshotLinks } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { CREATOR_PROFILE_KINDS, creatorFillDatesDescriptor, creatorProfileDescriptor, creatorProfileTargetFromBinding, type CreatorProfileTarget } from "@/lib/providers/creator-profile-targets";
import { snapshotHash, type SnapshotReference } from "@/lib/providers/snapshot-values";
import { attachProviderSnapshots, getProviderSnapshot, lockProviderSnapshotReferences, withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";

/** The adapter descriptor is the source of truth for a complete profile, including its request shape. */
function currentBindingSnapshotCondition() {
  return or(...CREATOR_PROFILE_KINDS.map(kind => {
    const descriptor = creatorProfileDescriptor({ ...kind, externalId: "1" });
    return and(eq(providerCreatorBindings.provider, kind.provider),
      sql`${providerCreatorBindings.externalCreatorId} like ${`${kind.bindingPrefix}%`}`,
      eq(providerSnapshots.providerCode, descriptor.providerCode), eq(providerSnapshots.resourceType, descriptor.resourceType),
      eq(providerSnapshots.apiMethod, descriptor.apiMethod), eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams)),
      sql`${providerSnapshots.externalId} = substring(${providerCreatorBindings.externalCreatorId} from ${kind.bindingPrefix.length + 1}::integer)`);
  }));
}

export function creatorProfileBindingBatchQuery(input: { provider?: string; creatorIds?: number[]; bindingIds?: number[]; afterId: number; throughId: number; batchSize: number; onlyMissingSnapshots?: boolean; retryId?: number }) {
  const missingLink = notExists(db.select({ id: providerSnapshots.id }).from(providerSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "creator"), sql`${providerSnapshotLinks.entityId}=${providerCreatorBindings.creatorId}::text`,
      eq(providerSnapshotLinks.purpose, "primary"), currentBindingSnapshotCondition())));
  return db.select({ id: providerCreatorBindings.id, creatorId: providerCreatorBindings.creatorId, provider: providerCreatorBindings.provider,
    externalCreatorId: providerCreatorBindings.externalCreatorId }).from(providerCreatorBindings).where(and(
      eq(providerCreatorBindings.active, true), inArray(providerCreatorBindings.provider, [...new Set(CREATOR_PROFILE_KINDS.map(kind => kind.provider))]),
      input.provider ? eq(providerCreatorBindings.provider, input.provider) : undefined,
      input.creatorIds ? inArray(providerCreatorBindings.creatorId, input.creatorIds) : undefined,
      input.bindingIds ? inArray(providerCreatorBindings.id, input.bindingIds) : undefined,
      gt(providerCreatorBindings.id, input.afterId), lte(providerCreatorBindings.id, input.throughId),
      input.onlyMissingSnapshots ? input.retryId ? or(missingLink, eq(providerCreatorBindings.id, input.retryId)) : missingLink : undefined,
    )).orderBy(asc(providerCreatorBindings.id)).limit(input.batchSize + 1);
}

export function creatorProfileCoverageQuery() {
  const profiles = CREATOR_PROFILE_KINDS.flatMap(kind => {
    const target = { ...kind, externalId: "1" };
    const standard = creatorProfileDescriptor(target);
    const dates = creatorFillDatesDescriptor(target);
    const descriptors = standard.apiMethod === dates.apiMethod && snapshotHash(standard.requestParams) === snapshotHash(dates.requestParams)
      ? [standard] : [standard, dates];
    return descriptors.map(descriptor => sql`(${descriptor.providerCode}::text, ${descriptor.resourceType}::text,
      ${descriptor.apiMethod}::text, ${snapshotHash(descriptor.requestParams)}::text, ${kind.bindingPrefix}::text)`);
  });
  return sql`
    with profiles(provider, resource, method, request_key, prefix) as (values ${sql.join(profiles, sql`, `)}),
    bindings_with_profiles as (
      select distinct b.id, b.creator_id, b.provider
      from profiles p
      join ${providerSnapshots} s on s.provider_code = p.provider and s.resource_type = p.resource
        and s.api_method = p.method and s.request_key = p.request_key
      join ${providerCreatorBindings} b on b.active and b.provider = p.provider
        and b.external_creator_id = p.prefix || s.external_id
    ),
    coverage as (
      select count(*)::int as total, count(*) filter (where p.creator_id is null)::int as "withoutSnapshots"
      from ${creators} c left join (select distinct creator_id from bindings_with_profiles) p on p.creator_id = c.id
    ),
    bindings_by_provider as (
      select k.provider, count(b.id)::int as total
      from (select distinct provider, prefix from profiles) k
      left join ${providerCreatorBindings} b on b.active and b.provider = k.provider
        and starts_with(b.external_creator_id, k.prefix)
      group by k.provider
    ),
    provider_coverage as (
      select b.provider, b.total - coalesce(p.total, 0) as "missingSnapshots"
      from bindings_by_provider b
      left join (select provider, count(*)::int as total from bindings_with_profiles group by provider) p
        on p.provider = b.provider
    )
    select coverage.*, (
      select jsonb_agg(p order by p."missingSnapshots" desc, p.provider)
      from provider_coverage p
    ) as "byProvider"
    from coverage
  `;
}

export async function getCreatorProfileCoverage() {
  const [coverage] = await db.execute<{
    total: number;
    withoutSnapshots: number;
    byProvider: { provider: CreatorProfileTarget["provider"]; missingSnapshots: number }[];
  }>(creatorProfileCoverageQuery());
  return coverage;
}

export async function getCreatorProfileSnapshot(target: CreatorProfileTarget, executor: DbTransaction | typeof db = db) {
  return getProviderSnapshot(creatorProfileDescriptor(target), executor);
}

export async function getCreatorProfileSources(creatorId: number) {
  const [creator] = await db.select({ id: creators.id, name: creators.name, typeCode: creatorTypes.code, birthDate: creators.birthDate, deathDate: creators.deathDate }).from(creators)
    .innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, creatorId));
  if (!creator) return null;
  const bindings = await db.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.creatorId, creatorId), eq(providerCreatorBindings.active, true)))
    .orderBy(asc(providerCreatorBindings.provider), asc(providerCreatorBindings.id));
  const supported = bindings.flatMap(binding => {
    const target = creatorProfileTargetFromBinding(binding);
    return target ? [{ binding, target, descriptor: creatorProfileDescriptor(target) }] : [];
  });
  const snapshots = supported.length ? await db.select({ snapshot: providerSnapshots, linked: sql<boolean>`exists (select 1 from provider_snapshot_links l where l.snapshot_id=${providerSnapshots.id} and l.entity_type='creator' and l.entity_id=${String(creatorId)} and l.purpose='primary')` })
    .from(providerSnapshots).where(or(...supported.map(({ descriptor: d }) => and(eq(providerSnapshots.providerCode, d.providerCode), eq(providerSnapshots.resourceType, d.resourceType),
      eq(providerSnapshots.externalId, d.externalId), eq(providerSnapshots.apiMethod, d.apiMethod), eq(providerSnapshots.requestKey, snapshotHash(d.requestParams)))))) : [];
  return { creator, sources: bindings.map(binding => {
    const item = supported.find(item => item.binding.id === binding.id);
    const saved = item ? snapshots.find(({ snapshot }) => snapshot.providerCode === item.descriptor.providerCode && snapshot.resourceType === item.descriptor.resourceType
      && snapshot.externalId === item.descriptor.externalId && snapshot.apiMethod === item.descriptor.apiMethod && snapshot.requestKey === snapshotHash(item.descriptor.requestParams)) : undefined;
    return { binding, target: item?.target ?? null, snapshot: saved?.snapshot ?? null, linked: saved?.linked ?? false,
      canApply: creator.typeCode === "person" && (item?.target.provider === "fantlab" || (item?.target.provider === "tmdb" && item.target.resourceType === "person")) && bindings.filter(row => row.provider === binding.provider && creatorProfileTargetFromBinding(row)?.resourceType === item?.target.resourceType).length === 1 };
  }) };
}

/** Parent first, then binding; no network or changes to working Creator fields. */
export async function attachCreatorProfileSnapshot(input: { creatorId: number; bindingId: number; ref: SnapshotReference; jobGuard?: SnapshotJobGuard; checkpoint?: Record<string, unknown> }) {
  return withSnapshotJobGuard(input.jobGuard, async tx => {
    const [creator] = await tx.select({ id: creators.id, typeCode: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, input.creatorId)).for("update", { of: creators });
    if (!creator) throw new Error("SNAPSHOT_ENTITY_NOT_FOUND");
    const [binding] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.id, input.bindingId), eq(providerCreatorBindings.creatorId, input.creatorId), eq(providerCreatorBindings.active, true))).for("share");
    const target = binding ? creatorProfileTargetFromBinding(binding) : null;
    if (!target || ((target.resourceType === "person" || target.resourceType === "author" || target.resourceType === "user") && creator.typeCode !== "person") || ((target.resourceType === "company" || target.resourceType === "network" || target.resourceType === "group" || (target.provider === "comic-vine" && target.resourceType === "publisher")) && creator.typeCode !== "organization")) throw new Error("PROVIDER_SOURCE_CHANGED");
    await lockProviderSnapshotReferences(tx, [input.ref]);
    const [snapshot] = await tx.select().from(providerSnapshots).where(eq(providerSnapshots.id, input.ref.id));
    const expected = creatorProfileDescriptor(target);
    if (!snapshot || snapshot.providerCode !== expected.providerCode || snapshot.resourceType !== expected.resourceType || snapshot.externalId !== expected.externalId
      || snapshot.apiMethod !== expected.apiMethod || snapshot.requestKey !== snapshotHash(expected.requestParams)) throw new Error("INVALID_CREATOR_SNAPSHOT");
    validateCreatorProfilePayload(target, snapshot.payload);
    await attachProviderSnapshots(tx, { entityType: "creator", entityId: String(input.creatorId) }, [{ ...input.ref, purpose: "primary" }], { kind: "admin" });
    if (input.jobGuard && input.checkpoint) await tx.update(jobRuns).set({ payload: input.checkpoint, updatedAt: new Date() }).where(eq(jobRuns.id, input.jobGuard.runId));
    return snapshot;
  });
}
