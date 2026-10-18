import { sql } from "drizzle-orm";

import { mediaItemTitleAliases } from "@/db/schema";

// Keep the outer reference qualified when Drizzle renders a single-table select.
const correlatedMediaItemIdSql = sql<number>`"media_items"."id"`;

/** Include ordered aliases in the existing query, without per-record requests. */
export const mediaItemDisplayAliasesSql = () => sql<string[]>`coalesce((
  select jsonb_agg(${mediaItemTitleAliases.value} order by ${mediaItemTitleAliases.id})
  from ${mediaItemTitleAliases}
  where ${mediaItemTitleAliases.mediaItemId} = ${correlatedMediaItemIdSql}
), '[]'::jsonb)`;
