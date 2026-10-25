import { sql, type SQLWrapper } from "drizzle-orm";

import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";

/** Uses the same published branch and link rules as the public series filter. */
export function publishedSeriesMembershipSql(mediaItemId: SQLWrapper, franchiseId: SQLWrapper, includeDescendants = true) {
  if (!includeDescendants) {
    return sql<boolean>`exists (
      select 1 from media_item_franchises series_link
      inner join franchises series on series.id = series_link.franchise_id
      where series_link.media_item_id = ${mediaItemId}
        and series_link.franchise_id = ${franchiseId}
        and series_link.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
        and series.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
    )`;
  }
  return sql<boolean>`exists (
    with recursive published_branch as (
      select series.id from franchises series
      where series.id = ${franchiseId}
        and series.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
      union all
      select child.id from franchises child
      inner join published_branch parent on child.parent_id = parent.id
      where child.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
    )
    select 1 from media_item_franchises series_link
    inner join published_branch branch on branch.id = series_link.franchise_id
    where series_link.media_item_id = ${mediaItemId}
      and series_link.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
  )`;
}
