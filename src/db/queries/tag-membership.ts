import { sql, type SQLWrapper } from "drizzle-orm";

/** One public-membership rule shared by archive, cards, genres and achievements. */
function publicTagThresholdSql() {
  return sql`bool_or(tag_author.is_system)
    or count(*) filter (where not tag_author.is_system) >=
      coalesce((select tag_publication_threshold from archive_settings where id = 1), 3)`;
}

/** Uncorrelated set for catalog semi-joins, counts and batch achievement evaluation. */
export function publicTagMediaItemIdsSql(tagId: SQLWrapper) {
  return sql`
    select assignment.media_item_id from media_item_tags assignment
    inner join authors tag_author on tag_author.id = assignment.author_id
    where assignment.tag_id = ${tagId}
    group by assignment.media_item_id
    having ${publicTagThresholdSql()}
  `;
}

/** Point membership must constrain both keys before aggregating a potentially popular tag. */
export function publicTagMembershipSql(mediaItemId: SQLWrapper, tagId: SQLWrapper) {
  return sql<boolean>`exists (
    select 1 from media_item_tags assignment
    inner join authors tag_author on tag_author.id = assignment.author_id
    where assignment.media_item_id = ${mediaItemId} and assignment.tag_id = ${tagId}
    group by assignment.media_item_id
    having ${publicTagThresholdSql()}
  )`;
}

/** All public pairs, aggregated once for dictionary lists and navigation visibility. */
export function publicTagPairsSql() {
  return sql`select assignment.media_item_id, assignment.tag_id from media_item_tags assignment
    inner join authors tag_author on tag_author.id = assignment.author_id
    group by assignment.media_item_id, assignment.tag_id having ${publicTagThresholdSql()}`;
}
