import { eq } from "drizzle-orm";

import { db } from "@/db";
import { archiveSettings, franchises } from "@/db/schema";
import {
  DEFAULT_MEDIA_ITEM_TITLE_ALIAS_LIMIT,
  parseMediaItemTitleAliasLimit,
} from "@/lib/media/title-aliases";

const ARCHIVE_SETTINGS_ID = 1;

export type ArchiveSettingsValue = {
  maxTitleAliases: number;
  maxFranchiseDepth: number;
};

export async function getArchiveSettings(): Promise<ArchiveSettingsValue> {
  const [settings] = await db
    .select({
      maxTitleAliases: archiveSettings.maxTitleAliases,
      maxFranchiseDepth: archiveSettings.maxFranchiseDepth,
    })
    .from(archiveSettings)
    .where(eq(archiveSettings.id, ARCHIVE_SETTINGS_ID))
    .limit(1);

  return {
    maxTitleAliases:
      parseMediaItemTitleAliasLimit(settings?.maxTitleAliases) ??
      DEFAULT_MEDIA_ITEM_TITLE_ALIAS_LIMIT,
    maxFranchiseDepth: settings?.maxFranchiseDepth >= 2 && settings.maxFranchiseDepth <= 5 ? settings.maxFranchiseDepth : 3,
  };
}

export async function updateArchiveSettings(
  input: ArchiveSettingsValue & { updatedByAdminId: number },
) {
  const maxTitleAliases = parseMediaItemTitleAliasLimit(input.maxTitleAliases);
  const maxFranchiseDepth = input.maxFranchiseDepth;

  if (maxTitleAliases === null || !Number.isInteger(maxFranchiseDepth) || maxFranchiseDepth < 2 || maxFranchiseDepth > 5) {
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
      updatedByAdminId: input.updatedByAdminId,
    })
    .onConflictDoUpdate({
      target: archiveSettings.id,
      set: {
        maxTitleAliases,
        maxFranchiseDepth,
        updatedByAdminId: input.updatedByAdminId,
        updatedAt: new Date(),
      },
    })
    .returning({
      maxTitleAliases: archiveSettings.maxTitleAliases,
      maxFranchiseDepth: archiveSettings.maxFranchiseDepth,
    });

  return settings;
}
