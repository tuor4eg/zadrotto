import { and, eq, exists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems, mediaItemTitleAliases } from "@/db/schema";
import { containsNormalizedSearchSql, normalizeSearchSql } from "@/db/search";
import { entryCreatorSearchCondition } from "@/db/queries/creators";
import { normalizeSearchText } from "@/lib/search/normalize";

export const mediaItemSearchCondition = (searchQuery: string) => {
  const normalizedSearchQuery = normalizeSearchText(searchQuery);

  if (!normalizedSearchQuery) {
    return undefined;
  }

  const codePattern = `%-${normalizedSearchQuery.replace(/\s+/g, "-")}-%`;

  return or(
    containsNormalizedSearchSql(mediaItems.title, normalizedSearchQuery),
    entryCreatorSearchCondition(normalizedSearchQuery),
    containsNormalizedSearchSql(mediaItems.originalTitle, normalizedSearchQuery),
    sql`('-' || ${normalizeSearchSql(mediaItems.code)} || '-') like ${codePattern}`,
    exists(
      db
        .select({ id: mediaItemTitleAliases.id })
        .from(mediaItemTitleAliases)
        .where(
          and(
            eq(mediaItemTitleAliases.mediaItemId, mediaItems.id),
            containsNormalizedSearchSql(mediaItemTitleAliases.value, normalizedSearchQuery),
          ),
        ),
    ),
  );
};
