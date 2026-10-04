import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authorAccessProfiles,
  authorActionLedger,
  authorProgress,
  authors,
  authorTrust,
  franchises,
  levelSettings,
  mediaItemFranchises,
  mediaItems,
  trustActionRules,
  trustSettings,
  xpActionRules,
} from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { lockAuthorForTransaction } from "@/db/transaction";
import { REGULAR_AUTHOR_ACCESS_PROFILE_CODE, TRUSTED_AUTHOR_ACCESS_PROFILE_CODE } from "@/lib/authors/access-profiles";
import type { PersistedDomainEvent } from "@/lib/domain-events/catalog";
import { appendDomainEvent, appendDomainEvents } from "@/lib/domain-events/persistence";
import type { DomainEventConsumer } from "@/lib/domain-events/registry";
import type { ReputationActionCode, ReputationOutcome } from "./model";
import { lockReputationForConsumer } from "./initialize";

type ReputationFact = {
  actionCode: ReputationActionCode;
  authorId: number;
  outcome: ReputationOutcome;
  sourceKey: string;
  sourceType: string;
};

async function getFact(tx: DbTransaction, event: PersistedDomainEvent): Promise<ReputationFact | null> {
  const rejected = event.type.endsWith(".rejected");
  if (event.type === "rating.created") {
    const payload = event.payload as { authorId: number };
    return { actionCode: "rating.created", authorId: payload.authorId, outcome: "published", sourceKey: event.aggregateId, sourceType: "rating" };
  }
  if (event.type === "media.published" || event.type === "media.approved" || event.type === "media.rejected") {
    const payloadAuthorId = "authorId" in event.payload ? event.payload.authorId : null;
    const [item] = await tx.select({ authorId: mediaItems.createdByAuthorId }).from(mediaItems)
      .where(eq(mediaItems.id, Number(event.aggregateId))).limit(1);
    const authorId = payloadAuthorId ?? item?.authorId;
    return authorId ? { actionCode: "media.published", authorId, outcome: rejected ? "rejected" : "published", sourceKey: event.aggregateId, sourceType: "media-item" } : null;
  }
  if (event.type === "review.published" || event.type === "review.approved" || event.type === "review.rejected") {
    const payload = event.payload as { authorId: number; contributionId?: number };
    return { actionCode: "review.published", authorId: payload.authorId, outcome: rejected ? "rejected" : "published", sourceKey: String(payload.contributionId ?? event.aggregateId), sourceType: "review" };
  }
  if (event.type === "bug-report.confirmed" || event.type === "bug-report.rejected") {
    const payload = event.payload as { authorId: number; bugReportId: number };
    return { actionCode: "bug-report.confirmed", authorId: payload.authorId, outcome: rejected ? "rejected" : "approved", sourceKey: String(payload.bugReportId), sourceType: "bug-report" };
  }
  if (event.type === "media-franchise.removal.approved" || event.type === "media-franchise.removal.rejected" || event.type === "media-franchise.removed") {
    const payload = event.payload as { authorId: number; franchiseId: number; mediaItemId: number };
    return {
      actionCode: "series.link-removal.published",
      authorId: payload.authorId,
      outcome: rejected ? "rejected" : "approved",
      sourceKey: `${payload.mediaItemId}:${payload.franchiseId}`,
      sourceType: "media-franchise-removal",
    };
  }
  if (event.type === "franchise.approved" || event.type === "franchise.rejected") {
    const payload = event.payload as { authorId: number; franchiseId: number };
    return {
      actionCode: "series.created-with-link.published",
      authorId: payload.authorId,
      outcome: rejected ? "rejected" : "published",
      sourceKey: String(payload.franchiseId),
      sourceType: "franchise",
    };
  }
  if (event.type === "media-franchise.published" || event.type === "media-franchise.approved" || event.type === "media-franchise.rejected") {
    const payload = event.payload as {
      authorId?: number;
      contributionKind?: "existing-series-link" | "new-series-with-link";
      franchiseId: number;
      mediaItemId: number;
    };
    const [link] = await tx.select({
      authorId: mediaItemFranchises.createdByAuthorId,
      franchiseAuthorId: franchises.createdByAuthorId,
    }).from(mediaItemFranchises)
      .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
      .where(and(eq(mediaItemFranchises.mediaItemId, payload.mediaItemId), eq(mediaItemFranchises.franchiseId, payload.franchiseId)))
      .limit(1);
    const authorId = payload.authorId ?? link?.authorId ?? event.actorAuthorId;
    if (!authorId) return null;
    const isCreatedSeries = payload.contributionKind === "new-series-with-link"
      || (payload.contributionKind === undefined && link?.franchiseAuthorId === authorId);
    return {
      actionCode: isCreatedSeries ? "series.created-with-link.published" : "series.link-existing.published",
      authorId,
      outcome: rejected ? "rejected" : "published",
      sourceKey: isCreatedSeries ? String(payload.franchiseId) : `${payload.mediaItemId}:${payload.franchiseId}`,
      sourceType: isCreatedSeries ? "franchise" : "media-franchise",
    };
  }
  return null;
}

async function promoteTrustedAuthorIfEligible(tx: DbTransaction, authorId: number) {
  const [candidate] = await tx.select({
    blockedAt: authors.blockedAt,
    currentProfileCode: authorAccessProfiles.code,
    level: authorProgress.currentLevel,
    trustPoints: authorTrust.trustPoints,
    successfulOutcomes: authorTrust.successfulOutcomes,
    rejectedOutcomes: authorTrust.rejectedOutcomes,
    firstQualifyingActionAt: authorTrust.firstQualifyingActionAt,
    suppressedAt: authorTrust.autoTrustSuppressedAt,
  }).from(authors)
    .innerJoin(authorAccessProfiles, eq(authorAccessProfiles.id, authors.accessProfileId))
    .innerJoin(authorProgress, eq(authorProgress.authorId, authors.id))
    .innerJoin(authorTrust, eq(authorTrust.authorId, authors.id))
    .where(eq(authors.id, authorId)).limit(1);
  if (!candidate || candidate.blockedAt || candidate.suppressedAt || candidate.currentProfileCode !== REGULAR_AUTHOR_ACCESS_PROFILE_CODE) return null;
  const [settings] = await tx.select().from(trustSettings).where(eq(trustSettings.id, 1)).limit(1);
  if (!settings?.autoPromotionEnabled || !candidate.firstQualifyingActionAt) return null;
  const decisions = candidate.successfulOutcomes + candidate.rejectedOutcomes;
  const approvalRate = decisions > 0 ? candidate.successfulOutcomes * 100 / decisions : 0;
  const historyMs = Date.now() - candidate.firstQualifyingActionAt.getTime();
  if (candidate.level < settings.minimumLevel
    || candidate.trustPoints < settings.minimumTrustPoints
    || approvalRate < settings.minimumApprovalRatePercent
    || historyMs < settings.minimumHistoryDays * 86_400_000) return null;
  const [trustedProfile] = await tx.select({ id: authorAccessProfiles.id }).from(authorAccessProfiles)
    .where(eq(authorAccessProfiles.code, TRUSTED_AUTHOR_ACCESS_PROFILE_CODE)).limit(1);
  if (!trustedProfile) return null;
  const [promoted] = await tx.update(authors).set({ accessProfileId: trustedProfile.id, updatedAt: new Date() })
    .where(and(eq(authors.id, authorId), eq(authors.accessProfileId, sql`(select id from author_access_profiles where code = ${REGULAR_AUTHOR_ACCESS_PROFILE_CODE})`), isNull(authors.blockedAt)))
    .returning({ id: authors.id });
  if (promoted) {
    await tx.update(authorTrust).set({ autoTrustedAt: new Date(), updatedAt: new Date() }).where(eq(authorTrust.authorId, authorId));
    const trustedEvent = await appendDomainEvent(tx, {
      actorAuthorId: null,
      aggregateId: String(authorId),
      aggregateType: "author",
      payload: { authorId },
      type: "author.trusted-granted",
    });
    return trustedEvent.id;
  }
  return null;
}

export async function promoteEligibleTrustedAuthors() {
  const eventIds = await db.transaction(async (tx) => {
    await lockReputationForConsumer(tx);
    const promotedRows = await tx.execute(sql`
      with eligible as (
        select authors.id, trusted_profile.id as trusted_profile_id
        from authors
        inner join author_access_profiles current_profile
          on current_profile.id = authors.access_profile_id and current_profile.code = ${REGULAR_AUTHOR_ACCESS_PROFILE_CODE}
        cross join author_access_profiles trusted_profile
        inner join author_progress progress on progress.author_id = authors.id
        inner join author_trust trust on trust.author_id = authors.id
        cross join trust_settings settings
        cross join level_settings system
        where trusted_profile.code = ${TRUSTED_AUTHOR_ACCESS_PROFILE_CODE}
          and settings.id = 1 and system.id = 1 and system.status = 'enabled'
          and settings.auto_promotion_enabled
          and authors.blocked_at is null and trust.auto_trust_suppressed_at is null
          and progress.current_level >= settings.minimum_level
          and trust.trust_points >= settings.minimum_trust_points
          and trust.successful_outcomes + trust.rejected_outcomes > 0
          and trust.successful_outcomes * 100.0 / (trust.successful_outcomes + trust.rejected_outcomes) >= settings.minimum_approval_rate_percent
          and trust.first_qualifying_action_at <= now() - make_interval(days => settings.minimum_history_days)
      ), promoted as (
        update authors set access_profile_id = eligible.trusted_profile_id, updated_at = now()
        from eligible where authors.id = eligible.id and authors.access_profile_id <> eligible.trusted_profile_id
        returning authors.id
      )
      update author_trust set auto_trusted_at = coalesce(auto_trusted_at, now()), updated_at = now()
      where author_id in (select id from promoted)
      returning author_id as "authorId"
    `);
    const promoted = Array.from(promotedRows as Iterable<{ authorId: number }>);
    const events = await appendDomainEvents(tx, promoted.map((row) => ({
      actorAuthorId: null,
      aggregateId: String(row.authorId),
      aggregateType: "author",
      payload: { authorId: row.authorId },
      type: "author.trusted-granted" as const,
    })));
    return events.map((event) => event.id);
  });
  return eventIds;
}

export async function applyReputationEvent(tx: DbTransaction, event: PersistedDomainEvent) {
  await lockReputationForConsumer(tx);
  const [system] = await tx.select({ status: levelSettings.status }).from(levelSettings).where(eq(levelSettings.id, 1)).limit(1);
  if (!system || system.status === "disabled") return;
  const fact = await getFact(tx, event);
  if (!fact) return;
  await lockAuthorForTransaction(tx, fact.authorId);
  const [xpRule, trustRule] = await Promise.all([
    tx.select({ xp: xpActionRules.xp }).from(xpActionRules).where(eq(xpActionRules.actionCode, fact.actionCode)).limit(1),
    tx.select({
      countsTowardTrust: trustActionRules.countsTowardTrust,
      trustPoints: trustActionRules.trustPoints,
    }).from(trustActionRules).where(eq(trustActionRules.actionCode, fact.actionCode)).limit(1),
  ]);
  if (!xpRule[0] || !trustRule[0]) return;
  const successful = fact.outcome !== "rejected";
  const rewardKey = `${fact.actionCode}:${fact.authorId}:${fact.sourceType}:${fact.sourceKey}`;
  const [reward] = successful ? await tx.insert(authorActionLedger).values({
    actionCode: fact.actionCode,
    authorId: fact.authorId,
    entryKind: "reward",
    idempotencyKey: `reward:${rewardKey}`,
    occurredAt: event.occurredAt,
    outcome: null,
    rewardKey,
    sourceEventId: event.id,
    sourceKey: fact.sourceKey,
    sourceType: fact.sourceType,
    trustDelta: trustRule[0].countsTowardTrust ? trustRule[0].trustPoints : 0,
    xpDelta: xpRule[0].xp,
  }).onConflictDoNothing({ target: authorActionLedger.idempotencyKey }).returning({ id: authorActionLedger.id }) : [];
  const outcomeIdempotencyKey = successful
    ? `outcome:success:${rewardKey}`
    : `outcome:rejected:${event.id}:${fact.actionCode}`;
  const [outcome] = trustRule[0].countsTowardTrust
    ? await tx.insert(authorActionLedger).values({
      actionCode: fact.actionCode,
      authorId: fact.authorId,
      entryKind: "outcome",
      idempotencyKey: outcomeIdempotencyKey,
      occurredAt: event.occurredAt,
      outcome: fact.outcome,
      rewardKey: null,
      sourceEventId: event.id,
      sourceKey: fact.sourceKey,
      sourceType: fact.sourceType,
      trustDelta: 0,
      xpDelta: 0,
    }).onConflictDoNothing({ target: authorActionLedger.idempotencyKey }).returning({ id: authorActionLedger.id })
    : [];
  if (!reward && !outcome) return;

  const now = new Date();
  await tx.insert(authorProgress).values({ authorId: fact.authorId }).onConflictDoNothing();
  await tx.insert(authorTrust).values({ authorId: fact.authorId }).onConflictDoNothing();
  let previousLevel: number | null = null;
  if (reward && xpRule[0].xp > 0) {
    const [progressBeforeLevelUpdate] = await tx.update(authorProgress)
      .set({ xpTotal: sql`${authorProgress.xpTotal} + ${xpRule[0].xp}`, updatedAt: now })
      .where(eq(authorProgress.authorId, fact.authorId))
      .returning({ currentLevel: authorProgress.currentLevel });
    previousLevel = progressBeforeLevelUpdate?.currentLevel ?? null;
  }
  const [progressAfterLevelUpdate] = await tx.update(authorProgress).set({
    currentLevel: sql`greatest(${authorProgress.currentLevel}, coalesce((select max(level) from level_thresholds where xp_threshold <= ${authorProgress.xpTotal}), 1))`,
    maxAchievedLevel: sql`greatest(${authorProgress.maxAchievedLevel}, coalesce((select max(level) from level_thresholds where xp_threshold <= ${authorProgress.xpTotal}), 1))`,
    updatedAt: now,
  }).where(eq(authorProgress.authorId, fact.authorId))
    .returning({ currentLevel: authorProgress.currentLevel });
  await tx.update(levelSettings).set({
    maxLockedLevel: sql`greatest(${levelSettings.maxLockedLevel}, (select ${authorProgress.maxAchievedLevel} from ${authorProgress} where ${authorProgress.authorId} = ${fact.authorId}))`,
    updatedAt: now,
  }).where(eq(levelSettings.id, 1));

  const achievedLevel = progressAfterLevelUpdate?.currentLevel ?? null;
  let followUpEventIds: string[] | undefined;
  if (previousLevel !== null && achievedLevel !== null && achievedLevel > previousLevel) {
    const levelEvent = await appendDomainEvent(tx, {
      actorAuthorId: fact.authorId,
      aggregateId: String(fact.authorId),
      aggregateType: "author",
      occurredAt: event.occurredAt,
      payload: { authorId: fact.authorId, level: achievedLevel, previousLevel },
      type: "author.level-achieved",
    });
    followUpEventIds = [levelEvent.id];
  }

  const rateSuccess = outcome && successful ? 1 : 0;
  const rateRejected = outcome && !successful ? 1 : 0;
  const occurredAtIso = event.occurredAt.toISOString();
  await tx.update(authorTrust).set({
    trustPoints: sql`${authorTrust.trustPoints} + ${reward && trustRule[0].countsTowardTrust ? trustRule[0].trustPoints : 0}`,
    successfulOutcomes: sql`${authorTrust.successfulOutcomes} + ${rateSuccess}`,
    rejectedOutcomes: sql`${authorTrust.rejectedOutcomes} + ${rateRejected}`,
    firstQualifyingActionAt: outcome
      ? sql`least(coalesce(${authorTrust.firstQualifyingActionAt}, ${occurredAtIso}::timestamptz), ${occurredAtIso}::timestamptz)`
      : authorTrust.firstQualifyingActionAt,
    updatedAt: now,
  }).where(eq(authorTrust.authorId, fact.authorId));
  const trustedEventId = await promoteTrustedAuthorIfEligible(tx, fact.authorId);
  if (trustedEventId) followUpEventIds = [...(followUpEventIds ?? []), trustedEventId];
  return followUpEventIds;
}

export const reputationDomainEventConsumer: DomainEventConsumer = {
  key: "reputation.apply",
  eventTypes: [
    "rating.created",
    "media.published", "media.approved", "media.rejected",
    "review.published", "review.approved", "review.rejected",
    "media-franchise.published", "media-franchise.approved", "media-franchise.rejected",
    "media-franchise.removal.approved", "media-franchise.removal.rejected", "media-franchise.removed",
    "franchise.approved", "franchise.rejected",
    "bug-report.confirmed", "bug-report.rejected",
  ],
  handle: applyReputationEvent,
};
