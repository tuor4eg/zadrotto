import "server-only";

import { sql } from "drizzle-orm";

/** Canonical read-only stream shared by preview and production initialization. */
export function historicalReputationFactsSql() {
  return sql`
    with creator_links as (
      select links.media_item_id, links.franchise_id, links.created_by_author_id,
        row_number() over (partition by links.franchise_id order by links.created_at, links.media_item_id) as creator_link_number
      from media_item_franchises links
      inner join franchises series on series.id = links.franchise_id
      where links.created_by_author_id is not null and links.created_by_author_id = series.created_by_author_id
    )
    select ratings.author_id, 'rating.created'::text action_code, 'rating'::text source_type,
      ratings.id::text source_key, 'published'::text outcome, ratings.created_at occurred_at
    from ratings
    union all
    select media.created_by_author_id, 'media.published', 'media-item', media.id::text,
      case when media.publication_status = 'rejected' then 'rejected' else 'published' end,
      coalesce(media.reviewed_at, media.created_at)
    from media_items media
    where media.created_by_author_id is not null and media.publication_status in ('published', 'rejected')
    union all
    select series.created_by_author_id, 'series.created-with-link.published', 'franchise', series.id::text,
      case when series.publication_status = 'rejected' then 'rejected' else 'published' end, series.created_at
    from franchises series
    where series.created_by_author_id is not null and series.publication_status in ('published', 'rejected')
      and exists (select 1 from creator_links links where links.franchise_id = series.id and links.creator_link_number = 1)
    union all
    select links.created_by_author_id, 'series.link-existing.published', 'media-franchise',
      links.media_item_id::text || ':' || links.franchise_id::text,
      case when links.publication_status = 'rejected' then 'rejected' else 'published' end, links.created_at
    from media_item_franchises links
    left join creator_links creator on creator.media_item_id = links.media_item_id
      and creator.franchise_id = links.franchise_id and creator.creator_link_number = 1
    where links.created_by_author_id is not null and links.publication_status in ('published', 'rejected')
      and creator.franchise_id is null
    union all
    select reviews.author_id, 'review.published', 'review', reviews.id::text,
      case when reviews.status = 'rejected' then 'rejected' else 'published' end,
      coalesce(reviews.reviewed_at, reviews.created_at)
    from contributions reviews where reviews.type = 'review' and reviews.status in ('published', 'rejected')
    union all
    select reports.author_id, 'bug-report.confirmed', 'bug-report', reports.id::text,
      case when reports.status = 'rejected' then 'rejected' else 'approved' end,
      coalesce(reports.confirmed_at, reports.resolved_at, reports.created_at)
    from bug_reports reports where reports.confirmed_at is not null or reports.status = 'rejected'
    union all
    select (events.payload->>'authorId')::int, 'series.link-removal.published', 'media-franchise-removal',
      events.aggregate_id,
      case when events.type = 'media-franchise.removal.rejected' then 'rejected' else 'approved' end,
      events.occurred_at
    from domain_events events
    where events.type in ('media-franchise.removal.approved', 'media-franchise.removal.rejected', 'media-franchise.removed')
      and events.payload->>'authorId' ~ '^[1-9][0-9]*$'
  `;
}
