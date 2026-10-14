import { sql } from "drizzle-orm";
import { contributions, ratings } from "@/db/schema";

/** Uses the joined scoped rating first, then only the explicit overall rating. */
export function reviewAuthorScoreSql() {
  return sql<number | null>`coalesce(case when NOT EXISTS (select 1 from title_parts special_part where special_part.id = ${contributions.partId} and special_part.type = 'season' and special_part.number = 0) then ${ratings.score} end, (
    select overall.score from ratings overall
    where overall.author_id = ${contributions.authorId}
      and overall.media_item_id = ${contributions.primaryMediaItemId}
      and overall.part_id is null
  ))`;
}
