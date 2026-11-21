import { createJobRun } from "@/db/queries/jobs";
import { lockClassificationMutations } from "@/db/queries/classification-lock";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { archiveSettings, franchises, achievements } from "@/db/schema";
import { isAutomoderationMode, type AutomoderationMode } from "@/lib/automoderation/model";
import {
  DEFAULT_MEDIA_ITEM_TITLE_ALIAS_LIMIT,
  parseMediaItemTitleAliasLimit,
} from "@/lib/media/title-aliases";
import {
  DEFAULT_DAILY_DOSSIER_MIN_AVERAGE_SCORE,
  DEFAULT_DAILY_DOSSIER_MIN_RATINGS_COUNT,
  parseDailyDossierMinAverageScore,
  parseDailyDossierMinRatingsCount,
} from "@/lib/main-page/daily-dossier-settings";
import {
  DEFAULT_RECENTLY_VIEWED_HISTORY_LIMIT,
  DEFAULT_RECENTLY_VIEWED_TTL_DAYS,
  parseRecentlyViewedHistoryLimit,
  parseRecentlyViewedTtlDays,
} from "@/lib/main-page/recently-viewed-settings";
import {
  DEFAULT_TOP_ARCHIVE_MIN_AVERAGE_SCORE,
  DEFAULT_TOP_ARCHIVE_MIN_RATINGS_COUNT,
  parseTopArchiveMinAverageScore,
  parseTopArchiveMinRatingsCount,
} from "@/lib/main-page/top-archive-settings";

const ARCHIVE_SETTINGS_ID = 1;

export type ArchiveSettingsValue = {
  exportRetentionDays: number;
  mediaAutoModerationMode: AutomoderationMode;
  dailyDossierMinAverageScore: number;
  dailyDossierMinRatingsCount: number;
  maxTitleAliases: number;
  maxFranchiseDepth: number;
  tagPublicationThreshold: number;
  recentlyViewedHistoryLimit: number;
  recentlyViewedTtlDays: number;
  topArchiveMinAverageScore: number;
  topArchiveMinRatingsCount: number;
};

export async function getArchiveSettings(): Promise<ArchiveSettingsValue> {
  const [settings] = await db
    .select({
      maxTitleAliases: archiveSettings.maxTitleAliases,
      maxFranchiseDepth: archiveSettings.maxFranchiseDepth,
      tagPublicationThreshold: archiveSettings.tagPublicationThreshold,
      dailyDossierMinAverageScore: archiveSettings.dailyDossierMinAverageScore,
      dailyDossierMinRatingsCount: archiveSettings.dailyDossierMinRatingsCount,
      recentlyViewedHistoryLimit: archiveSettings.recentlyViewedHistoryLimit,
      recentlyViewedTtlDays: archiveSettings.recentlyViewedTtlDays,
      topArchiveMinAverageScore: archiveSettings.topArchiveMinAverageScore,
      topArchiveMinRatingsCount: archiveSettings.topArchiveMinRatingsCount,
      exportRetentionDays: archiveSettings.exportRetentionDays,
      mediaAutoModerationMode: archiveSettings.mediaAutoModerationMode,
    })
    .from(archiveSettings)
    .where(eq(archiveSettings.id, ARCHIVE_SETTINGS_ID))
    .limit(1);

  return {
    exportRetentionDays: settings?.exportRetentionDays >= 1 && settings.exportRetentionDays <= 90 ? settings.exportRetentionDays : 7,
    mediaAutoModerationMode: isAutomoderationMode(settings?.mediaAutoModerationMode)
      ? settings.mediaAutoModerationMode
      : "off",
    dailyDossierMinAverageScore:
      parseDailyDossierMinAverageScore(settings?.dailyDossierMinAverageScore) ??
      DEFAULT_DAILY_DOSSIER_MIN_AVERAGE_SCORE,
    dailyDossierMinRatingsCount:
      parseDailyDossierMinRatingsCount(settings?.dailyDossierMinRatingsCount) ??
      DEFAULT_DAILY_DOSSIER_MIN_RATINGS_COUNT,
    maxTitleAliases:
      parseMediaItemTitleAliasLimit(settings?.maxTitleAliases) ??
      DEFAULT_MEDIA_ITEM_TITLE_ALIAS_LIMIT,
    tagPublicationThreshold: settings?.tagPublicationThreshold >= 1 ? settings.tagPublicationThreshold : 3,
    maxFranchiseDepth: settings?.maxFranchiseDepth >= 2 && settings.maxFranchiseDepth <= 5 ? settings.maxFranchiseDepth : 3,
    recentlyViewedHistoryLimit:
      parseRecentlyViewedHistoryLimit(settings?.recentlyViewedHistoryLimit) ??
      DEFAULT_RECENTLY_VIEWED_HISTORY_LIMIT,
    recentlyViewedTtlDays:
      parseRecentlyViewedTtlDays(settings?.recentlyViewedTtlDays) ??
      DEFAULT_RECENTLY_VIEWED_TTL_DAYS,
    topArchiveMinAverageScore:
      parseTopArchiveMinAverageScore(settings?.topArchiveMinAverageScore) ??
      DEFAULT_TOP_ARCHIVE_MIN_AVERAGE_SCORE,
    topArchiveMinRatingsCount:
      parseTopArchiveMinRatingsCount(settings?.topArchiveMinRatingsCount) ??
      DEFAULT_TOP_ARCHIVE_MIN_RATINGS_COUNT,
  };
}

export async function updateArchiveSettings(
  input: Omit<ArchiveSettingsValue, "exportRetentionDays" | "tagPublicationThreshold"> & { tagPublicationThreshold?: number; exportRetentionDays?: number; updatedByAdminId: number },
) {
  const tagPublicationThreshold = input.tagPublicationThreshold ?? 3;
  if (!Number.isSafeInteger(tagPublicationThreshold) || tagPublicationThreshold < 1 || tagPublicationThreshold > 2147483647) throw new Error("Invalid tag threshold");
  return db.transaction(async tx => {
    await lockClassificationMutations(tx);
    const [previous] = await tx.select({ threshold: archiveSettings.tagPublicationThreshold }).from(archiveSettings).where(eq(archiveSettings.id, ARCHIVE_SETTINGS_ID));
    const maxTitleAliases = parseMediaItemTitleAliasLimit(input.maxTitleAliases);
    const maxFranchiseDepth = input.maxFranchiseDepth;
    const dailyDossierMinAverageScore = parseDailyDossierMinAverageScore(
      input.dailyDossierMinAverageScore,
    );
    const dailyDossierMinRatingsCount = parseDailyDossierMinRatingsCount(
      input.dailyDossierMinRatingsCount,
    );
    const recentlyViewedHistoryLimit = parseRecentlyViewedHistoryLimit(input.recentlyViewedHistoryLimit);
    const recentlyViewedTtlDays = parseRecentlyViewedTtlDays(input.recentlyViewedTtlDays);
    const topArchiveMinAverageScore = parseTopArchiveMinAverageScore(input.topArchiveMinAverageScore);
    const topArchiveMinRatingsCount = parseTopArchiveMinRatingsCount(input.topArchiveMinRatingsCount);
    const exportRetentionDays = Number(input.exportRetentionDays ?? 7);
    const mediaAutoModerationMode = input.mediaAutoModerationMode;

    if (!isAutomoderationMode(mediaAutoModerationMode) || maxTitleAliases === null || dailyDossierMinAverageScore === null || dailyDossierMinRatingsCount === null || recentlyViewedHistoryLimit === null || recentlyViewedTtlDays === null || topArchiveMinAverageScore === null || topArchiveMinRatingsCount === null || !Number.isInteger(exportRetentionDays) || exportRetentionDays < 1 || exportRetentionDays > 90 || !Number.isInteger(maxFranchiseDepth) || maxFranchiseDepth < 2 || maxFranchiseDepth > 5) {
      throw new Error("Invalid archive settings");
    }
    const rows = await tx.select({ id: franchises.id, parentId: franchises.parentId }).from(franchises);
    const parents = new Map(rows.map((row) => [row.id, row.parentId]));
    const currentMaxDepth = Math.max(1, ...rows.map((row) => { let depth = 1; let parentId = row.parentId; while (parentId) { depth += 1; parentId = parents.get(parentId) ?? null; } return depth; }));
    if (maxFranchiseDepth < currentMaxDepth) throw new Error("Franchise depth is below existing tree");

    const [settings] = await tx
      .insert(archiveSettings)
      .values({
        id: ARCHIVE_SETTINGS_ID,
        maxTitleAliases,
        maxFranchiseDepth,
        tagPublicationThreshold,
        dailyDossierMinAverageScore,
        dailyDossierMinRatingsCount,
        recentlyViewedHistoryLimit,
        recentlyViewedTtlDays,
        topArchiveMinAverageScore,
        topArchiveMinRatingsCount,
        exportRetentionDays,
        mediaAutoModerationMode,
        updatedByAdminId: input.updatedByAdminId,
      })
      .onConflictDoUpdate({
        target: archiveSettings.id,
        set: {
          maxTitleAliases,
          maxFranchiseDepth,
          tagPublicationThreshold,
          dailyDossierMinAverageScore,
          dailyDossierMinRatingsCount,
          recentlyViewedHistoryLimit,
          recentlyViewedTtlDays,
          topArchiveMinAverageScore,
          topArchiveMinRatingsCount,
          exportRetentionDays,
          mediaAutoModerationMode,
          updatedByAdminId: input.updatedByAdminId,
          updatedAt: new Date(),
        },
      })
      .returning({
        maxTitleAliases: archiveSettings.maxTitleAliases,
        maxFranchiseDepth: archiveSettings.maxFranchiseDepth,
        tagPublicationThreshold: archiveSettings.tagPublicationThreshold,
        dailyDossierMinAverageScore: archiveSettings.dailyDossierMinAverageScore,
        dailyDossierMinRatingsCount: archiveSettings.dailyDossierMinRatingsCount,
        recentlyViewedHistoryLimit: archiveSettings.recentlyViewedHistoryLimit,
        recentlyViewedTtlDays: archiveSettings.recentlyViewedTtlDays,
        topArchiveMinAverageScore: archiveSettings.topArchiveMinAverageScore,
        topArchiveMinRatingsCount: archiveSettings.topArchiveMinRatingsCount,
        exportRetentionDays: archiveSettings.exportRetentionDays,
        mediaAutoModerationMode: archiveSettings.mediaAutoModerationMode,
      });

    if ((previous?.threshold ?? 3) !== tagPublicationThreshold) {
      const affected = await tx.select({ id: achievements.id }).from(achievements).where(sql`${achievements.params} ? 'tagId'`);
      if (affected.length) await createJobRun({
        type: "achievements.backfill", source: "manual", createdByAdminId: input.updatedByAdminId,
        payload: { achievementIds: affected.map(row => row.id), batchSize: 100 },
        maxAttempts: 3, retryBaseSeconds: 5, retryMaxSeconds: 300, timeoutSeconds: 300,
      }, new Date(), tx);
    }
    return settings;
  });
}
