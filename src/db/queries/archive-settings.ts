import { eq } from "drizzle-orm";

import { db } from "@/db";
import { archiveSettings, franchises } from "@/db/schema";
import {
  DEFAULT_MEDIA_ITEM_TITLE_ALIAS_LIMIT,
  parseMediaItemTitleAliasLimit,
} from "@/lib/media/title-aliases";
import {
  DEFAULT_DAILY_DOSSIER_MIN_AVERAGE_SCORE,
  parseDailyDossierMinAverageScore,
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
  dailyDossierMinAverageScore: number;
  maxTitleAliases: number;
  maxFranchiseDepth: number;
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
      dailyDossierMinAverageScore: archiveSettings.dailyDossierMinAverageScore,
      recentlyViewedHistoryLimit: archiveSettings.recentlyViewedHistoryLimit,
      recentlyViewedTtlDays: archiveSettings.recentlyViewedTtlDays,
      topArchiveMinAverageScore: archiveSettings.topArchiveMinAverageScore,
      topArchiveMinRatingsCount: archiveSettings.topArchiveMinRatingsCount,
    })
    .from(archiveSettings)
    .where(eq(archiveSettings.id, ARCHIVE_SETTINGS_ID))
    .limit(1);

  return {
    dailyDossierMinAverageScore:
      parseDailyDossierMinAverageScore(settings?.dailyDossierMinAverageScore) ??
      DEFAULT_DAILY_DOSSIER_MIN_AVERAGE_SCORE,
    maxTitleAliases:
      parseMediaItemTitleAliasLimit(settings?.maxTitleAliases) ??
      DEFAULT_MEDIA_ITEM_TITLE_ALIAS_LIMIT,
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
  input: ArchiveSettingsValue & { updatedByAdminId: number },
) {
  const maxTitleAliases = parseMediaItemTitleAliasLimit(input.maxTitleAliases);
  const maxFranchiseDepth = input.maxFranchiseDepth;
  const dailyDossierMinAverageScore = parseDailyDossierMinAverageScore(
    input.dailyDossierMinAverageScore,
  );
  const recentlyViewedHistoryLimit = parseRecentlyViewedHistoryLimit(input.recentlyViewedHistoryLimit);
  const recentlyViewedTtlDays = parseRecentlyViewedTtlDays(input.recentlyViewedTtlDays);
  const topArchiveMinAverageScore = parseTopArchiveMinAverageScore(input.topArchiveMinAverageScore);
  const topArchiveMinRatingsCount = parseTopArchiveMinRatingsCount(input.topArchiveMinRatingsCount);

  if (maxTitleAliases === null || dailyDossierMinAverageScore === null || recentlyViewedHistoryLimit === null || recentlyViewedTtlDays === null || topArchiveMinAverageScore === null || topArchiveMinRatingsCount === null || !Number.isInteger(maxFranchiseDepth) || maxFranchiseDepth < 2 || maxFranchiseDepth > 5) {
    throw new Error("Invalid archive settings");
  }
  const rows = await db.select({ id: franchises.id, parentId: franchises.parentId }).from(franchises);
  const parents = new Map(rows.map((row) => [row.id, row.parentId]));
  const currentMaxDepth = Math.max(1, ...rows.map((row) => { let depth = 1; let parentId = row.parentId; while (parentId) { depth += 1; parentId = parents.get(parentId) ?? null; } return depth; }));
  if (maxFranchiseDepth < currentMaxDepth) throw new Error("Franchise depth is below existing tree");

  const [settings] = await db
    .insert(archiveSettings)
    .values({
      id: ARCHIVE_SETTINGS_ID,
      maxTitleAliases,
      maxFranchiseDepth,
      dailyDossierMinAverageScore,
      recentlyViewedHistoryLimit,
      recentlyViewedTtlDays,
      topArchiveMinAverageScore,
      topArchiveMinRatingsCount,
      updatedByAdminId: input.updatedByAdminId,
    })
    .onConflictDoUpdate({
      target: archiveSettings.id,
      set: {
        maxTitleAliases,
        maxFranchiseDepth,
        dailyDossierMinAverageScore,
        recentlyViewedHistoryLimit,
        recentlyViewedTtlDays,
        topArchiveMinAverageScore,
        topArchiveMinRatingsCount,
        updatedByAdminId: input.updatedByAdminId,
        updatedAt: new Date(),
      },
    })
    .returning({
      maxTitleAliases: archiveSettings.maxTitleAliases,
      maxFranchiseDepth: archiveSettings.maxFranchiseDepth,
      dailyDossierMinAverageScore: archiveSettings.dailyDossierMinAverageScore,
      recentlyViewedHistoryLimit: archiveSettings.recentlyViewedHistoryLimit,
      recentlyViewedTtlDays: archiveSettings.recentlyViewedTtlDays,
      topArchiveMinAverageScore: archiveSettings.topArchiveMinAverageScore,
      topArchiveMinRatingsCount: archiveSettings.topArchiveMinRatingsCount,
    });

  return settings;
}
