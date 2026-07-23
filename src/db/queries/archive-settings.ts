import { eq } from "drizzle-orm";

import { db } from "@/db";
import { archiveSettings } from "@/db/schema";
import {
  DEFAULT_MEDIA_ITEM_TITLE_ALIAS_LIMIT,
  parseMediaItemTitleAliasLimit,
} from "@/lib/media/title-aliases";

const ARCHIVE_SETTINGS_ID = 1;

export type ArchiveSettingsValue = {
  maxTitleAliases: number;
};

export async function getArchiveSettings(): Promise<ArchiveSettingsValue> {
  const [settings] = await db
    .select({
      maxTitleAliases: archiveSettings.maxTitleAliases,
    })
    .from(archiveSettings)
    .where(eq(archiveSettings.id, ARCHIVE_SETTINGS_ID))
    .limit(1);

  return {
    maxTitleAliases:
      parseMediaItemTitleAliasLimit(settings?.maxTitleAliases) ??
      DEFAULT_MEDIA_ITEM_TITLE_ALIAS_LIMIT,
  };
}

export async function updateArchiveSettings(
  input: ArchiveSettingsValue & { updatedByAdminId: number },
) {
  const maxTitleAliases = parseMediaItemTitleAliasLimit(input.maxTitleAliases);

  if (maxTitleAliases === null) {
    throw new Error("Invalid archive settings");
  }

  const [settings] = await db
    .insert(archiveSettings)
    .values({
      id: ARCHIVE_SETTINGS_ID,
      maxTitleAliases,
      updatedByAdminId: input.updatedByAdminId,
    })
    .onConflictDoUpdate({
      target: archiveSettings.id,
      set: {
        maxTitleAliases,
        updatedByAdminId: input.updatedByAdminId,
        updatedAt: new Date(),
      },
    })
    .returning({
      maxTitleAliases: archiveSettings.maxTitleAliases,
    });

  return settings;
}
