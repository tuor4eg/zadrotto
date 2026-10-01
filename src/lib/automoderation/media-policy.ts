import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  automoderationChecks,
  franchises,
  mediaItemFranchises,
  mediaItemProviderSnapshots,
  mediaItemTitleAliases,
  mediaItems,
} from "@/db/schema";
import { runInDomainEventTransaction } from "@/db/transaction";
import {
  getCoverProviderCredentialsForSearch,
  getCoverProviderRateLimits,
  getCoverProviderSettings,
  getCoverSettings,
} from "@/db/queries/cover-settings";
import { findPublishedMediaItemDuplicateCandidates } from "@/db/queries/media-items";
import { createProviderCoverSearchRateLimiter } from "@/lib/covers/rate-limits";
import { getTitleMetadata } from "@/lib/covers/registry";
import { isMediaProviderCode } from "@/lib/media/metadata-candidates";
import { isMediaTypeCode, type MediaType } from "@/lib/media/types";

const SUSPICIOUS_TEXT = /(?:https?:\/\/|www\.|<\/?(?:script|iframe|object)\b|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|(.)\1{11,})/iu;

function comparable(value: string | null) {
  return value?.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU") || null;
}

function textLooksSuspicious(value: string | null) {
  if (!value) return false;
  const compact = value.replace(/\s+/g, "");
  return value.length > 10_000 || SUSPICIOUS_TEXT.test(value) || (compact.length >= 8 && !/[\p{L}\p{N}]/u.test(compact));
}

export async function evaluateMediaAutomoderationCheck(checkId: number) {
  const [check] = await db.select().from(automoderationChecks)
    .where(and(eq(automoderationChecks.id, checkId), eq(automoderationChecks.status, "running")))
    .limit(1);
  if (!check || check.subjectType !== "media-item") return null;
  const mediaItemId = Number(check.subjectKey);
  if (!Number.isSafeInteger(mediaItemId) || mediaItemId < 1) return null;

  const [item] = await db.select({
    coverSourceExternalId: mediaItems.coverSourceExternalId,
    coverSourceProvider: mediaItems.coverSourceProvider,
    coverUrl: mediaItems.coverUrl,
    description: mediaItems.description,
    mediaCarrierId: mediaItems.mediaCarrierId,
    mediaType: mediaItems.mediaType,
    moderationRevision: mediaItems.moderationRevision,
    originalTitle: mediaItems.originalTitle,
    publicationStatus: mediaItems.publicationStatus,
    releaseYear: mediaItems.releaseYear,
    title: mediaItems.title,
    updatedAt: mediaItems.updatedAt,
  }).from(mediaItems).where(eq(mediaItems.id, mediaItemId)).limit(1);
  if (!item || item.publicationStatus !== "submitted" || item.moderationRevision !== check.subjectRevision) {
    return {
      stale: true as const,
      mediaItemId,
      title: item?.title ?? null,
    };
  }

  const [snapshotRows, aliasRows, franchiseRows] = await Promise.all([
    db.select().from(mediaItemProviderSnapshots)
      .where(eq(mediaItemProviderSnapshots.mediaItemId, mediaItemId)).limit(1),
    db.select({ value: mediaItemTitleAliases.value }).from(mediaItemTitleAliases)
      .where(eq(mediaItemTitleAliases.mediaItemId, mediaItemId)),
    db.select({ id: franchises.id, status: franchises.publicationStatus })
      .from(mediaItemFranchises)
      .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
      .where(eq(mediaItemFranchises.mediaItemId, mediaItemId)),
  ]);
  const snapshot = snapshotRows[0];
  const reasons = new Set<string>();
  if (!snapshot) reasons.add("provider_snapshot_missing");
  if (aliasRows.length > 0) reasons.add("user_aliases_present");
  if (franchiseRows.some((row) => row.status !== "published")) {
    reasons.add("new_or_unpublished_franchise");
  }
  if ([item.title, item.originalTitle, item.description, ...aliasRows.map((row) => row.value)]
    .some(textLooksSuspicious)) reasons.add("suspicious_text");

  if (snapshot) {
    if (snapshot.mediaType !== item.mediaType) reasons.add("media_type_mismatch");
    if (comparable(snapshot.title) !== comparable(item.title)) reasons.add("title_changed");
    if (comparable(snapshot.originalTitle) !== comparable(item.originalTitle)) reasons.add("original_title_changed");
    if (comparable(snapshot.description) !== comparable(item.description)) reasons.add("description_changed");
    if (snapshot.releaseYear !== item.releaseYear) reasons.add("release_year_changed");
    if (item.coverUrl && (
      !isMediaProviderCode(item.coverSourceProvider) ||
      !item.coverSourceExternalId?.trim()
    )) reasons.add("unverified_cover");

    if (!isMediaProviderCode(snapshot.providerCode) || !isMediaTypeCode(snapshot.mediaType)) {
      reasons.add("provider_source_invalid");
    } else {
      const [coverSettings, providerSettings, providerRateLimits, providerCredentials] = await Promise.all([
        getCoverSettings(),
        getCoverProviderSettings(),
        getCoverProviderRateLimits(),
        getCoverProviderCredentialsForSearch(),
      ]);
      const rateLimiter = createProviderCoverSearchRateLimiter(providerRateLimits);
      const fresh = await getTitleMetadata({
        provider: snapshot.providerCode,
        externalId: snapshot.externalId,
        mediaType: snapshot.mediaType,
      }, undefined, {
        candidateLimit: coverSettings.candidateLimit,
        tmdbResultScanLimit: coverSettings.tmdbResultScanLimit,
        requestTimeoutMs: coverSettings.providerRequestTimeoutMs,
        providerCredentials,
        beforeProviderSearch: rateLimiter.canSearchProvider,
      }, providerSettings);
      if (fresh.error) reasons.add(`provider_${fresh.error}`);
      if (!fresh.metadata) reasons.add("provider_item_not_found");
      if (fresh.metadata && (
        fresh.metadata.provider !== snapshot.providerCode ||
        fresh.metadata.externalId !== snapshot.externalId
      )) reasons.add("provider_identity_mismatch");
    }
  }

  const duplicateMatches = await findPublishedMediaItemDuplicateCandidates({
    aliases: aliasRows.map((row) => row.value),
    excludeMediaItemId: mediaItemId,
    mediaType: item.mediaType as MediaType,
    originalTitle: item.originalTitle,
    releaseYear: item.releaseYear,
    title: item.title,
  });
  if (duplicateMatches.length > 0) reasons.add("published_duplicate_candidate");

  return {
    stale: false as const,
    decision: reasons.size === 0 ? "AUTO_APPROVE" as const : "NEEDS_REVIEW" as const,
    reasonCodes: [...reasons].sort(),
    expectedUpdatedAt: item.updatedAt,
    mediaItemId,
    title: item.title,
    details: {
      franchiseIds: franchiseRows.map((row) => row.id).sort((a, b) => a - b),
      providerCode: snapshot?.providerCode ?? null,
      providerExternalId: snapshot?.externalId ?? null,
    },
  };
}

export async function autoApproveMediaItem(input: {
  checkId: number;
  mediaItemId: number;
  expectedRevision: number;
  expectedUpdatedAt: Date;
}) {
  const now = new Date();
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const [item] = await tx.update(mediaItems).set({
      publicationStatus: "published",
      reviewedByAdminId: null,
      reviewedAt: now,
      updatedAt: now,
    }).where(and(
      eq(mediaItems.id, input.mediaItemId),
      eq(mediaItems.publicationStatus, "submitted"),
      eq(mediaItems.moderationRevision, input.expectedRevision),
      eq(mediaItems.updatedAt, input.expectedUpdatedAt),
      sql`not exists (
        select 1 from ${mediaItemFranchises}
        inner join ${franchises} on ${franchises.id} = ${mediaItemFranchises.franchiseId}
        where ${mediaItemFranchises.mediaItemId} = ${mediaItems.id}
          and ${franchises.publicationStatus} <> 'published'
      )`,
    )).returning({
      authorId: mediaItems.createdByAuthorId,
      code: mediaItems.code,
      id: mediaItems.id,
      title: mediaItems.title,
    });
    if (!item?.authorId) return null;

    await tx.delete(mediaItemProviderSnapshots)
      .where(eq(mediaItemProviderSnapshots.mediaItemId, item.id));
    await tx.update(automoderationChecks).set({
      autoApprovedAt: now,
      completedAt: now,
      decision: "AUTO_APPROVE",
      status: "completed",
      updatedAt: now,
    }).where(and(
      eq(automoderationChecks.id, input.checkId),
      ne(automoderationChecks.status, "stale"),
    ));
    await appendEvent({
      actorAuthorId: null,
      aggregateId: String(item.id),
      aggregateType: "media-item",
      payload: { mediaItemId: item.id },
      type: "media.published",
    });
    await appendEvent({
      actorAuthorId: null,
      aggregateId: String(item.id),
      aggregateType: "media-item",
      payload: { authorId: item.authorId, mediaItemId: item.id },
      type: "media.approved",
    });
    await appendEvent({
      actorAuthorId: null,
      aggregateId: String(item.id),
      aggregateType: "media-item",
      payload: {
        authorId: item.authorId,
        checkId: input.checkId,
        subjectKey: String(item.id),
        subjectType: "media-item",
      },
      type: "automoderation.approved",
    });
    return item;
  });
}
