import { applyProviderCreatorName } from "./creator-name-import";
import { and, asc, eq, gt, inArray, lte, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { creators, creatorTypes, jobRuns, providerCreatorBindings, providerSnapshots } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { planCreatorLifeDates } from "@/lib/creators/life-dates";
import { fantlabAuthorDescriptor, mapFantlabAuthorDates, mapTmdbPersonDates, mapCreatorProviderRussianName } from "@/lib/providers/creator-adapters";
import { creatorProfileDescriptor } from "@/lib/providers/creator-profile-targets";
import { snapshotHash, type SnapshotReference } from "@/lib/providers/snapshot-values";
import type { SnapshotJobPayload } from "@/lib/providers/snapshot-job-payload";
import { attachProviderSnapshots, getProviderSnapshot, lockProviderSnapshotReferences, withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";

export function creatorSnapshotBatchQuery(input: { afterId: number; throughId: number; creatorIds?: number[]; batchSize: number; provider?: "fantlab" | "tmdb"; onlyMissingSnapshots?: boolean; retryId?: number }) {
  const provider = input.provider ?? "fantlab";
  if (input.onlyMissingSnapshots) {
    const descriptor = provider === "tmdb" ? creatorProfileDescriptor({ provider: "tmdb", resourceType: "person", externalId: "1" }) : fantlabAuthorDescriptor("1");
    const missing = notExists(db.select({ id: providerSnapshots.id }).from(providerSnapshots).where(and(
      eq(providerSnapshots.providerCode, descriptor.providerCode), eq(providerSnapshots.resourceType, descriptor.resourceType),
      provider === "tmdb" ? sql`${providerSnapshots.externalId} = substring(${providerCreatorBindings.externalCreatorId} from 8)` : eq(providerSnapshots.externalId, providerCreatorBindings.externalCreatorId), eq(providerSnapshots.apiMethod, descriptor.apiMethod),
      eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams)),
    )));
    return db.selectDistinct({ id: providerCreatorBindings.creatorId }).from(providerCreatorBindings).where(and(
      eq(providerCreatorBindings.provider, provider), eq(providerCreatorBindings.active, true),
      provider === "tmdb" ? sql`${providerCreatorBindings.externalCreatorId} like 'person:%'` : undefined,
      gt(providerCreatorBindings.creatorId, input.afterId), lte(providerCreatorBindings.creatorId, input.throughId),
      input.creatorIds ? inArray(providerCreatorBindings.creatorId, input.creatorIds) : undefined,
      // An interrupted fetch may have saved raw before dates/links/checkpoint committed.
      input.retryId ? or(missing, eq(providerCreatorBindings.creatorId, input.retryId)) : missing,
    )).orderBy(asc(providerCreatorBindings.creatorId)).limit(input.batchSize + 1);
  }
  if (!input.creatorIds) return db.selectDistinct({ id: providerCreatorBindings.creatorId }).from(providerCreatorBindings).where(and(
    eq(providerCreatorBindings.provider, provider), eq(providerCreatorBindings.active, true),
      provider === "tmdb" ? sql`${providerCreatorBindings.externalCreatorId} like 'person:%'` : undefined,
    gt(providerCreatorBindings.creatorId, input.afterId), lte(providerCreatorBindings.creatorId, input.throughId),
  )).orderBy(asc(providerCreatorBindings.creatorId)).limit(input.batchSize + 1);
  return db.select({ id: creators.id }).from(creators).where(and(
    gt(creators.id, input.afterId), lte(creators.id, input.throughId),
    inArray(creators.id, input.creatorIds),
  )).orderBy(asc(creators.id)).limit(input.batchSize + 1);
}

export async function getCreatorSnapshotState(creatorId: number, connection: DbTransaction | typeof db = db, provider: "fantlab" | "tmdb" = "fantlab", lockBindings = false) {
  const [row] = await connection.select({ id: creators.id, name: creators.name, birthDate: creators.birthDate, deathDate: creators.deathDate,
    typeCode: creatorTypes.code,
    isPseudonym: sql<boolean>`exists (select 1 from creator_relations r where r.source_creator_id=${creators.id} and r.relation_type='pseudonym_of')`,
  }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, creatorId));
  if (!row) return null;
  const bindingQuery = connection.select({ id: providerCreatorBindings.id, externalCreatorId: providerCreatorBindings.externalCreatorId })
    .from(providerCreatorBindings).where(and(eq(providerCreatorBindings.creatorId, creatorId), eq(providerCreatorBindings.provider, provider), eq(providerCreatorBindings.active, true),
      provider === "tmdb" ? sql`${providerCreatorBindings.externalCreatorId} like 'person:%'` : undefined))
    .orderBy(asc(providerCreatorBindings.id));
  const bindings = await (lockBindings ? bindingQuery.for("share") : bindingQuery);
  return { ...row, bindings };
}

export async function getCreatorSnapshotComparison(creatorId: number, provider: "fantlab" | "tmdb" = "fantlab") {
  const state = await getCreatorSnapshotState(creatorId, db, provider);
  if (!state) return null;
  const diagnostics: string[] = [];
  const descriptor = state.bindings.length === 1 ? provider === "tmdb" ? creatorProfileDescriptor({ provider: "tmdb", resourceType: "person", externalId: state.bindings[0].externalCreatorId.slice(7) }) : fantlabAuthorDescriptor(state.bindings[0].externalCreatorId) : null;
  const snapshot = descriptor ? await getProviderSnapshot(descriptor) : null;
  if (state.bindings.length !== 1) diagnostics.push(state.bindings.length ? "ambiguous-binding" : "missing-binding");
  let projection = null;
  let changes: { birthDate?: string; deathDate?: string } = {};
  if (snapshot) {
    try {
      projection = provider === "tmdb" ? mapTmdbPersonDates(snapshot) : mapFantlabAuthorDates(snapshot);
      const plan = planCreatorLifeDates(state, projection);
      changes = plan.changes;
      diagnostics.push(...projection.diagnostics, ...plan.diagnostics);
    } catch { diagnostics.push("invalid-creator-snapshot"); }
  }
  return { state, snapshot, projection, changes, diagnostics };
}

/** Network-free apply; caller prepared the reference, never arbitrary provider data. */
export async function commitCreatorSnapshot(input: {
  creatorId: number; bindingId: number; externalId: string; provider?: "fantlab" | "tmdb"; ref: SnapshotReference; process: boolean;
  jobGuard?: SnapshotJobGuard; checkpoint?: SnapshotJobPayload;
}) {
  return withSnapshotJobGuard(input.jobGuard, async tx => {
    const [creator] = await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, input.creatorId)).for("update");
    if (!creator) throw new Error("SNAPSHOT_ENTITY_NOT_FOUND");
    const state = (await getCreatorSnapshotState(input.creatorId, tx, input.provider, true))!;
    if (state.bindings.length !== 1 || state.bindings[0].id !== input.bindingId || state.bindings[0].externalCreatorId !== input.externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
    const [snapshot] = await lockProviderSnapshotReferences(tx, [input.ref]);
    const expected = input.provider === "tmdb" ? creatorProfileDescriptor({ provider: "tmdb", resourceType: "person", externalId: input.externalId.replace(/^person:/, "") }) : fantlabAuthorDescriptor(input.externalId);
    if (snapshot.externalId !== expected.externalId || snapshot.providerCode !== expected.providerCode || snapshot.resourceType !== expected.resourceType
      || snapshot.apiMethod !== expected.apiMethod || snapshotHash(snapshot.requestParams) !== snapshotHash(expected.requestParams)) throw new Error("INVALID_CREATOR_SNAPSHOT");
    const projection = input.provider === "tmdb" ? mapTmdbPersonDates(snapshot) : mapFantlabAuthorDates(snapshot);
    const plan = input.process ? planCreatorLifeDates(state, projection) : { changes: {}, diagnostics: [] };
    const diagnostics = [...projection.diagnostics, ...plan.diagnostics];
    if (input.process && state.typeCode === "person") await applyProviderCreatorName(tx, input.creatorId, mapCreatorProviderRussianName(snapshot));
    if (Object.keys(plan.changes).length) await tx.update(creators).set({ ...plan.changes, updatedAt: new Date() }).where(eq(creators.id, input.creatorId));
    await attachProviderSnapshots(tx, { entityType: "creator", entityId: String(input.creatorId) }, [{ ...input.ref, purpose: "primary" }], { kind: "system" });
    if (input.checkpoint && input.jobGuard) {
      const checkpoint = input.checkpoint.checkpoint!;
      const payload = { ...input.checkpoint, checkpoint: { ...checkpoint,
        diagnostics: [...(checkpoint.diagnostics ?? []), ...(diagnostics.length ? [{ id: input.creatorId, codes: diagnostics }] : [])].slice(-100),
      } };
      await tx.update(jobRuns).set({ payload, updatedAt: new Date() }).where(eq(jobRuns.id, input.jobGuard.runId));
    }
    return { ...plan, diagnostics };
  });
}
