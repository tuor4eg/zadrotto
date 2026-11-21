import { and, asc, eq, exists, gt, inArray, isNull, lte, not, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { creatorFieldsFillAttempts, creatorRelations, creators, creatorTypes, providerCreatorBindings, providerSnapshots } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { CREATOR_FILL_FIELDS, type CreatorFieldsFillProvider, type CreatorFillField } from "@/lib/creators/fields-fill-payload";
import { snapshotHash, type SnapshotReference } from "@/lib/providers/snapshot-values";
import type { SnapshotDescriptor } from "@/lib/providers/types";
import { attachProviderSnapshots, withSnapshotJobGuard, type SnapshotJobGuard, type StoredProviderSnapshot } from "./provider-snapshots";

export type { CreatorFillField } from "@/lib/creators/fields-fill-payload";
export type CreatorFieldsBinding = Pick<typeof providerCreatorBindings.$inferSelect, "id" | "provider" | "externalCreatorId">;
export type CreatorFieldsSnapshotSource = { bindingId: number; descriptor: SnapshotDescriptor };
type Executor = typeof db | DbTransaction;
type Attempts = Partial<Record<CreatorFillField, string>>;
type DateChanges = { birthDate?: string; deathDate?: string };

function pseudonymCondition(executor: Executor, creatorId: number | typeof creators.id) {
  return exists(executor.select({ sourceCreatorId: creatorRelations.sourceCreatorId })
    .from(creatorRelations).where(and(eq(creatorRelations.sourceCreatorId, creatorId), eq(creatorRelations.relationType, "pseudonym_of"))));
}

function activeBindingsCondition(creatorId: number | typeof creators.id) {
  return and(eq(providerCreatorBindings.creatorId, creatorId), eq(providerCreatorBindings.active, true));
}

export async function readCreatorFieldsState(creatorId: number, executor: Executor = db, lock = false) {
  const creatorQuery = executor.select({ id: creators.id, birthDate: creators.birthDate, deathDate: creators.deathDate, typeCode: creatorTypes.code })
    .from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, creatorId));
  const [creator] = await (lock ? creatorQuery.for("update", { of: creators }) : creatorQuery);
  if (!creator) return null;

  // Read relations only after the creator lock is acquired so an editor's changes are visible after waiting.
  const [relations] = await executor.select({ isPseudonym: sql<boolean>`${pseudonymCondition(executor, creatorId)}` }).from(creators)
    .where(eq(creators.id, creatorId));
  if (!relations) return null;
  const bindingQuery = executor.select({ id: providerCreatorBindings.id, provider: providerCreatorBindings.provider,
    externalCreatorId: providerCreatorBindings.externalCreatorId }).from(providerCreatorBindings)
    .where(activeBindingsCondition(creatorId)).orderBy(asc(providerCreatorBindings.id));
  const bindings = await (lock ? bindingQuery.for("share") : bindingQuery);
  const storedAttempts = await executor.select({ field: creatorFieldsFillAttempts.field, fingerprint: creatorFieldsFillAttempts.fingerprint })
    .from(creatorFieldsFillAttempts).where(eq(creatorFieldsFillAttempts.creatorId, creatorId));
  const attempts: Attempts = Object.fromEntries(storedAttempts.map(({ field, fingerprint }) => [field, fingerprint]));
  return { ...creator, isPseudonym: relations.isPseudonym, bindings, attempts };
}

export type CreatorFieldsState = NonNullable<Awaited<ReturnType<typeof readCreatorFieldsState>>>;

type CandidateInput = { afterId: number; throughId: number; creatorIds?: readonly number[]; providers?: readonly CreatorFieldsFillProvider[]; fields: readonly CreatorFillField[]; limit: number };

export function creatorFieldsCandidateQuery(input: CandidateInput) {
  const personFields = or(
    input.fields.includes("birthDate") ? isNull(creators.birthDate) : undefined,
    input.fields.includes("deathDate") ? isNull(creators.deathDate) : undefined,
  );
  return db.select({ id: creators.id }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId))
    .where(and(
      gt(creators.id, input.afterId),
      lte(creators.id, input.throughId),
      input.creatorIds ? inArray(creators.id, input.creatorIds) : undefined,
      exists(db.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(
        activeBindingsCondition(creators.id),
        input.providers ? inArray(providerCreatorBindings.provider, input.providers) : undefined,
      ))),
      or(
        personFields ? and(eq(creatorTypes.code, "person"), not(pseudonymCondition(db, creators.id)), personFields) : undefined,
        input.fields.includes("foundedDate") ? and(eq(creatorTypes.code, "organization"), isNull(creators.birthDate)) : undefined,
      ),
    )).orderBy(asc(creators.id)).limit(input.limit);
}

export async function creatorFieldsCandidates(input: CandidateInput) {
  if (!input.fields.length) return [];
  return (await creatorFieldsCandidateQuery(input)).map(({ id }) => id);
}

export async function readCreatorFieldsSnapshots(sources: readonly CreatorFieldsSnapshotSource[], executor: Executor = db, lock = false) {
  const byBinding = new Map<number, StoredProviderSnapshot>();
  if (!sources.length) return byBinding;

  const identities = sources.map(({ bindingId, descriptor }) => ({ bindingId, ...descriptor, requestKey: snapshotHash(descriptor.requestParams) }));
  const snapshotQuery = executor.select().from(providerSnapshots).where(or(...identities.map(identity => and(
    eq(providerSnapshots.providerCode, identity.providerCode),
    eq(providerSnapshots.resourceType, identity.resourceType),
    eq(providerSnapshots.externalId, identity.externalId),
    eq(providerSnapshots.apiMethod, identity.apiMethod),
    eq(providerSnapshots.requestKey, identity.requestKey),
  )))).orderBy(asc(providerSnapshots.id));
  const rows = await (lock ? snapshotQuery.for("share") : snapshotQuery);
  for (const identity of identities) {
    const snapshot = rows.find(row => row.providerCode === identity.providerCode && row.resourceType === identity.resourceType
      && row.externalId === identity.externalId && row.apiMethod === identity.apiMethod && row.requestKey === identity.requestKey);
    if (snapshot) byBinding.set(identity.bindingId, snapshot);
  }
  return byBinding;
}

function canFillField(state: CreatorFieldsState, field: CreatorFillField) {
  if (field === "foundedDate") return state.typeCode === "organization" && state.birthDate === null;
  return state.typeCode === "person" && !state.isPseudonym && state[field] === null;
}

type CommitInput<TResult> = {
  creatorId: number;
  guard?: SnapshotJobGuard;
  snapshots: (state: CreatorFieldsState) => readonly CreatorFieldsSnapshotSource[];
  resolve: (state: CreatorFieldsState | null, snapshots: ReadonlyMap<number, StoredProviderSnapshot>) => {
    changes?: DateChanges;
    attempts?: Attempts;
    snapshotRefs?: SnapshotReference[];
    result: TResult;
  };
  saveProgress?: (tx: DbTransaction, result: TResult) => Promise<void>;
};

export function commitCreatorFields<TResult>(input: CommitInput<TResult>) {
  return withSnapshotJobGuard(input.guard, async tx => {
    const state = await readCreatorFieldsState(input.creatorId, tx, true);
    const snapshots = await readCreatorFieldsSnapshots(state ? input.snapshots(state) : [], tx, true);
    const { changes, attempts, snapshotRefs, result } = input.resolve(state, snapshots);
    if (state) {
      if (snapshotRefs?.length) {
        await attachProviderSnapshots(tx, { entityType: "creator", entityId: String(state.id) },
          snapshotRefs.map(ref => ({ ...ref, purpose: "primary" })), { kind: "system" });
      }
      const attemptsToSave = CREATOR_FILL_FIELDS.flatMap(field => {
        const fingerprint = attempts?.[field];
        return fingerprint && canFillField(state, field) ? [{ creatorId: state.id, field, fingerprint }] : [];
      });
      const birthField = state.typeCode === "organization" ? "foundedDate" : "birthDate";
      const birthDate = canFillField(state, birthField) ? changes?.birthDate : undefined;
      const deathDate = canFillField(state, "deathDate") ? changes?.deathDate : undefined;
      if (birthDate !== undefined || deathDate !== undefined) {
        await tx.update(creators).set({ birthDate, deathDate, updatedAt: new Date() }).where(eq(creators.id, state.id));
      }
      if (attemptsToSave.length) {
        await tx.insert(creatorFieldsFillAttempts).values(attemptsToSave).onConflictDoUpdate({
          target: [creatorFieldsFillAttempts.creatorId, creatorFieldsFillAttempts.field],
          set: { fingerprint: sql`excluded.fingerprint` },
        });
      }
    }
    await input.saveProgress?.(tx, result);
    return result;
  });
}
