import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
import { accountMergeArchive, authorActionLedger, authorProgress, authorTrust, contributions, ratings } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";

type MergeReputationInput = {
  mergeId?: string;
  primaryAuthorId: number;
  secondaryAuthorId: number;
  ratingAliases: Record<string, string>;
  reviewAliases: Record<string, string>;
};
type Fact = typeof authorActionLedger.$inferSelect;
const BATCH_SIZE = 500;

function factKey(row: Pick<Fact, "entryKind" | "actionCode" | "sourceType" | "sourceKey" | "outcome" | "idempotencyKey">) {
  if (row.entryKind === "outcome" && row.outcome === "rejected") return `rejected:${row.idempotencyKey}`;
  return JSON.stringify([row.entryKind, row.actionCode, row.sourceType, row.sourceKey]);
}
const sameDate = (a: Date | null, b: Date | null) => a?.getTime() === b?.getTime();

/** Caller holds reputation shared lock and both author/write locks. Primary facts are immutable here. */
export async function reconcileMergedReputation(tx: DbTransaction, input: MergeReputationInput) {
  const ids = [input.primaryAuthorId, input.secondaryAuthorId];
  const secondaryLedger = await tx.select().from(authorActionLedger).where(eq(authorActionLedger.authorId, input.secondaryAuthorId));
  const progress = await tx.select().from(authorProgress).where(inArray(authorProgress.authorId, ids));
  const trust = await tx.select().from(authorTrust).where(inArray(authorTrust.authorId, ids));
  const primaryProgress = progress.find(row => row.authorId === input.primaryAuthorId);
  const secondaryProgress = progress.find(row => row.authorId === input.secondaryAuthorId);
  const primaryTrust = trust.find(row => row.authorId === input.primaryAuthorId);
  const suppressions = trust.flatMap(row => row.autoTrustSuppressedAt ? [row.autoTrustSuppressedAt] : []);
  const suppression = suppressions.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const hasSecondaryMetadata = (secondaryProgress?.maxAchievedLevel ?? 1) > (primaryProgress?.maxAchievedLevel ?? 1)
    || !sameDate(suppression, primaryTrust?.autoTrustSuppressedAt ?? null);

  let transferredFacts = 0;
  if (secondaryLedger.length) {
    // Compare by the fact's meaning, not by rewriting the primary's existing keys.
    const primaryKeys = await tx.select({
      entryKind: authorActionLedger.entryKind, actionCode: authorActionLedger.actionCode,
      sourceType: authorActionLedger.sourceType, sourceKey: authorActionLedger.sourceKey,
      outcome: authorActionLedger.outcome, idempotencyKey: authorActionLedger.idempotencyKey,
    }).from(authorActionLedger).where(eq(authorActionLedger.authorId, input.primaryAuthorId));
    const seen = new Set(primaryKeys.map(factKey));
    const sourceIds = (type: string, aliases: Record<string, string>) => [...new Set(secondaryLedger.filter(row => row.sourceType === type)
      .map(row => Number(aliases[row.sourceKey] ?? row.sourceKey)).filter(Number.isSafeInteger))];
    const ratingIds = sourceIds("rating", input.ratingAliases);
    const reviewIds = sourceIds("review", input.reviewAliases);
    const existingRatings = new Set(ratingIds.length ? (await tx.select({ id: ratings.id }).from(ratings).where(inArray(ratings.id, ratingIds))).map(row => String(row.id)) : []);
    const existingReviews = new Set(reviewIds.length ? (await tx.select({ id: contributions.id }).from(contributions).where(inArray(contributions.id, reviewIds))).map(row => String(row.id)) : []);
    const transferred: Fact[] = [];
    const discarded: Fact[] = [];
    for (const row of secondaryLedger.sort((a, b) => a.id - b.id)) {
      const aliases = row.sourceType === "rating" ? input.ratingAliases : row.sourceType === "review" ? input.reviewAliases : {};
      const sourceKey = aliases[row.sourceKey] ?? row.sourceKey;
      const rewardKey = `${row.actionCode}:${input.primaryAuthorId}:${row.sourceType}:${sourceKey}`;
      const moved = {
        ...row, authorId: input.primaryAuthorId, sourceKey,
        rewardKey: row.entryKind === "reward" ? rewardKey : null,
        idempotencyKey: row.entryKind === "reward" ? `reward:${rewardKey}`
          : row.outcome === "rejected" ? row.idempotencyKey : `outcome:success:${rewardKey}`,
      };
      const identity = factKey(moved);
      const missingSource = (row.sourceType === "rating" && !existingRatings.has(sourceKey))
        || (row.sourceType === "review" && !existingReviews.has(sourceKey));
      if (missingSource || seen.has(identity)) discarded.push(row);
      else { seen.add(identity); transferred.push(moved); }
    }
    transferredFacts = transferred.length;
    // Delete only discarded secondary facts. The primary's ledger is never deleted or rebuilt.
    for (let offset = 0; offset < discarded.length; offset += BATCH_SIZE) {
      const batch = discarded.slice(offset, offset + BATCH_SIZE);
      if (input.mergeId) await tx.insert(accountMergeArchive).values(batch.map(row => ({
        mergeId: input.mergeId!, sourceAuthorId: input.secondaryAuthorId, tableName: "author_action_ledger",
        entityKey: String(row.id), reason: "merge-conflict", snapshot: row,
      })));
      await tx.delete(authorActionLedger).where(inArray(authorActionLedger.id, batch.map(row => row.id)));
    }
    // Update existing secondary rows in bounded batches; retain IDs, deltas and timestamps.
    for (let offset = 0; offset < transferred.length; offset += BATCH_SIZE) {
      const batch = transferred.slice(offset, offset + BATCH_SIZE);
      const values = sql.join(batch.map(row => sql`(${row.id}::integer, ${row.sourceKey}::text, ${row.rewardKey}::text, ${row.idempotencyKey}::text)`), sql`, `);
      await tx.execute(sql`update author_action_ledger ledger set author_id = ${input.primaryAuthorId},
        source_key = moved.source_key, reward_key = moved.reward_key, idempotency_key = moved.idempotency_key
        from (values ${values}) as moved(id, source_key, reward_key, idempotency_key)
        where ledger.id = moved.id and ledger.author_id = ${input.secondaryAuthorId}`);
    }
  }

  // An empty OAuth duplicate contributes no facts or meaningful metadata: preserve the
  // primary's counters and timestamps as well, without even recalculating its history.
  if (transferredFacts || hasSecondaryMetadata) {
    const [totals] = await tx.execute(sql`select
      coalesce(sum(xp_delta) filter (where entry_kind = 'reward'), 0)::integer as xp,
      coalesce(sum(trust_delta) filter (where entry_kind = 'reward'), 0)::integer as trust,
      count(*) filter (where entry_kind = 'outcome' and outcome <> 'rejected')::integer as successes,
      count(*) filter (where entry_kind = 'outcome' and outcome = 'rejected')::integer as rejections,
      min(occurred_at) filter (where entry_kind = 'outcome') as first_outcome
      from author_action_ledger where author_id = ${input.primaryAuthorId}`);
    const xpTotal = Number(totals.xp);
    const levelRows = await tx.execute(sql`select coalesce(max(level), 1)::int as level from level_thresholds where xp_threshold <= ${xpTotal}`);
    const currentLevel = Number(Array.from(levelRows)[0]?.level ?? 1);
    const maxAchievedLevel = Math.max(currentLevel, ...progress.map(row => row.maxAchievedLevel));
    if (!primaryProgress || primaryProgress.xpTotal !== xpTotal || primaryProgress.currentLevel !== currentLevel || primaryProgress.maxAchievedLevel !== maxAchievedLevel) {
      const values = { xpTotal, currentLevel, maxAchievedLevel };
      await tx.insert(authorProgress).values({ authorId: input.primaryAuthorId, ...values }).onConflictDoUpdate({
        target: authorProgress.authorId, set: { ...values, updatedAt: new Date() },
      });
    }
    const values = {
      trustPoints: Number(totals.trust), successfulOutcomes: Number(totals.successes), rejectedOutcomes: Number(totals.rejections),
      firstQualifyingActionAt: totals.first_outcome ? new Date(String(totals.first_outcome)) : null,
      autoTrustSuppressedAt: suppression,
    };
    if (!primaryTrust || primaryTrust.trustPoints !== values.trustPoints || primaryTrust.successfulOutcomes !== values.successfulOutcomes
      || primaryTrust.rejectedOutcomes !== values.rejectedOutcomes || !sameDate(primaryTrust.firstQualifyingActionAt, values.firstQualifyingActionAt)
      || !sameDate(primaryTrust.autoTrustSuppressedAt, values.autoTrustSuppressedAt)) {
      await tx.insert(authorTrust).values({ authorId: input.primaryAuthorId, ...values, autoTrustedAt: primaryTrust?.autoTrustedAt ?? null }).onConflictDoUpdate({
        target: authorTrust.authorId, set: { ...values, updatedAt: new Date() },
      });
    }
    await tx.execute(sql`update level_settings set max_locked_level = ${maxAchievedLevel}, updated_at = now() where id = 1 and max_locked_level < ${maxAchievedLevel}`);
  }
  await tx.delete(authorProgress).where(eq(authorProgress.authorId, input.secondaryAuthorId));
  await tx.delete(authorTrust).where(eq(authorTrust.authorId, input.secondaryAuthorId));
}
