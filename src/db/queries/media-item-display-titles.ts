import { sql } from "drizzle-orm";

import { mediaItems, mediaItemTitleAliases } from "@/db/schema";

/** Include ordered aliases in the existing query, without per-record requests. */
export const mediaItemDisplayAliasesSql = () => sql<string[]>`coalesce((
  select jsonb_agg(${mediaItemTitleAliases.value} order by ${mediaItemTitleAliases.id})
  from ${mediaItemTitleAliases}
  where ${mediaItemTitleAliases.mediaItemId} = ${mediaItems.id}
), '[]'::jsonb)`;
