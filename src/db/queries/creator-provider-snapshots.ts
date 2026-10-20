import { and, asc, eq, gt, inArray, lte, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { creators, creatorTypes, jobRuns, providerCreatorBindings, providerSnapshots } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { planCreatorLifeDates } from "@/lib/creators/life-dates";
import { fantlabAuthorDescriptor, mapFantlabAuthorDates } from "@/lib/providers/creator-adapters";
import { snapshotHash, type SnapshotReference } from "@/lib/providers/snapshot-values";
import type { SnapshotJobPayload } from "@/lib/providers/snapshot-job-payload";
import { attachProviderSnapshots, getProviderSnapshot, lockProviderSnapshotReferences, withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";

export function creatorSnapshotBatchQuery(input: { afterId: number; throughId: number; creatorIds?: number[]; batchSize: number; onlyMissingSnapshots?: boolean; retryId?: number }) {
  if (input.onlyMissingSnapshots) {
    const descriptor = fantlabAuthorDescriptor("1");
    const missing = notExists(db.select({ id: providerSnapshots.id }).from(providerSnapshots).where(and(
      eq(providerSnapshots.providerCode, descriptor.providerCode), eq(providerSnapshots.resourceType, descriptor.resourceType),
      eq(providerSnapshots.externalId, providerCreatorBindings.externalCreatorId), eq(providerSnapshots.apiMethod, descriptor.apiMethod),
      eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams)),
    )));
    return db.selectDistinct({ id: providerCreatorBindings.creatorId }).from(providerCreatorBindings).where(and(
      eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true),
      gt(providerCreatorBindings.creatorId, input.afterId), lte(providerCreatorBindings.creatorId, input.throughId),
      input.creatorIds ? inArray(providerCreatorBindings.creatorId, input.creatorIds) : undefined,
      // An interrupted fetch may have saved raw before dates/links/checkpoint committed.
      input.retryId ? or(missing, eq(providerCreatorBindings.creatorId, input.retryId)) : missing,
    )).orderBy(asc(providerCreatorBindings.creatorId)).limit(input.batchSize + 1);
  }
  if (!input.creatorIds) return db.selectDistinct({ id: providerCreatorBindings.creatorId }).from(providerCreatorBindings).where(and(
    eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true),
    gt(providerCreatorBindings.creatorId, input.afterId), lte(providerCreatorBindings.creatorId, input.throughId),
  )).orderBy(asc(providerCreatorBindings.creatorId)).limit(input.batchSize + 1);
  return db.select({ id: creators.id }).from(creators).where(and(
    gt(creators.id, input.afterId), lte(creators.id, input.throughId),
    inArray(creators.id, input.creatorIds),
  )).orderBy(asc(creators.id)).limit(input.batchSize + 1);
}

export async function getCreatorSnapshotState(creatorId: number, connection: DbTransaction | typeof db = db) {
  const [row] = await connection.select({ id: creators.id, name: creators.name, birthDate: creators.birthDate, deathDate: creators.deathDate,
    typeCode: creatorTypes.code,
    isPseudonym: sql<boolean>`exists (select 1 from creator_relations r where r.source_creator_id=${creators.id} and r.relation_type='pseudonym_of')`,
  }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, creatorId));
  if (!row) return null;
  const bindings = await connection.select({ id: providerCreatorBindings.id, externalCreatorId: providerCreatorBindings.externalCreatorId })
    .from(providerCreatorBindings).where(and(eq(providerCreatorBindings.creatorId, creatorId), eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true)))
    .orderBy(asc(providerCreatorBindings.id));
  return { ...row, bindings };
}

export async function getCreatorSnapshotComparison(creatorId: number) {
  const state = await getCreatorSnapshotState(creatorId);
  if (!state) return null;
  const diagnostics: string[] = [];
  const snapshot = state.bindings.length === 1 ? await getProviderSnapshot(fantlabAuthorDescriptor(state.bindings[0].externalCreatorId)) : null;
  if (state.bindings.length !== 1) diagnostics.push(state.bindings.length ? "ambiguous-binding" : "missing-binding");
  let projection = null;
  let changes: { birthDate?: string; deathDate?: string } = {};
  if (snapshot) {
    try {
      projection = mapFantlabAuthorDates(snapshot);
      const plan = planCreatorLifeDates(state, projection);
      changes = plan.changes;
      diagnostics.push(...projection.diagnostics, ...plan.diagnostics);
    } catch { diagnostics.push("invalid-creator-snapshot"); }
  }
  return { state, snapshot, projection, changes, diagnostics };
}

/** Network-free apply; caller prepared the reference, never arbitrary provider data. */
export async function commitCreatorSnapshot(input: {
  creatorId: number; bindingId: number; externalId: string; ref: SnapshotReference; process: boolean;
  jobGuard?: SnapshotJobGuard; checkpoint?: SnapshotJobPayload;
}) {
  return withSnapshotJobGuard(input.jobGuard, async tx => {
    const [creator] = await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, input.creatorId)).for("update");
    if (!creator) throw new Error("SNAPSHOT_ENTITY_NOT_FOUND");
    const state = (await getCreatorSnapshotState(input.creatorId, tx))!;
    if (state.bindings.length !== 1 || state.bindings[0].id !== input.bindingId || state.bindings[0].externalCreatorId !== input.externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
    const [snapshot] = await lockProviderSnapshotReferences(tx, [input.ref]);
    const expected = fantlabAuthorDescriptor(input.externalId);
    if (snapshot.externalId !== expected.externalId || snapshot.providerCode !== expected.providerCode || snapshot.resourceType !== expected.resourceType
      || snapshot.apiMethod !== expected.apiMethod || snapshotHash(snapshot.requestParams) !== snapshotHash(expected.requestParams)) throw new Error("INVALID_CREATOR_SNAPSHOT");
    const projection = mapFantlabAuthorDates(snapshot);
    const plan = input.process ? planCreatorLifeDates(state, projection) : { changes: {}, diagnostics: [] };
    const diagnostics = [...projection.diagnostics, ...plan.diagnostics];
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
