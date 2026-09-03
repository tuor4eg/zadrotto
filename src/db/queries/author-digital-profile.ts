import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types";
import {
  franchises,
  mediaItemFranchises,
  mediaItems,
  mediaTypes,
  ratings,
} from "@/db/schema";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";

export type DigitalProfileSeriesSummary = {
  id: number;
  code: string;
  title: string;
};

export type DigitalProfileMediaTypeSummary = {
  code: string;
  name: string;
};

export type AuthorDigitalProfile = {
  strongestSeries: DigitalProfileSeriesSummary | null;
  strongestSeriesCount: number;
  bestKnownType: DigitalProfileMediaTypeSummary | null;
  unexploredType: DigitalProfileMediaTypeSummary | null;
  activeSeries: DigitalProfileSeriesSummary | null;
  seriesRated: number;
  seriesTotal: number;
};

type AuthorDigitalProfileRow = {
  strongestSeriesId: number | null;
  strongestSeriesCode: string | null;
  strongestSeriesTitle: string | null;
  strongestSeriesCount: number | null;
  bestKnownTypeCode: string | null;
  bestKnownTypeName: string | null;
  unexploredTypeCode: string | null;
  unexploredTypeName: string | null;
  activeSeriesId: number | null;
  activeSeriesCode: string | null;
  activeSeriesTitle: string | null;
  seriesRated: number | null;
  seriesTotal: number | null;
};

const EMPTY_AUTHOR_DIGITAL_PROFILE: AuthorDigitalProfile = {
  strongestSeries: null,
  strongestSeriesCount: 0,
  bestKnownType: null,
  unexploredType: null,
  activeSeries: null,
  seriesRated: 0,
  seriesTotal: 0,
};

function mapSeriesSummary(input: {
  id: number | null;
  code: string | null;
  title: string | null;
}): DigitalProfileSeriesSummary | null {
  if (input.id === null || input.code === null || input.title === null) return null;

  return { id: input.id, code: input.code, title: input.title };
}

function mapMediaTypeSummary(input: {
  code: string | null;
  name: string | null;
}): DigitalProfileMediaTypeSummary | null {
  if (input.code === null || input.name === null) return null;

  return { code: input.code, name: input.name };
}

export async function getAuthorDigitalProfile(
  authorId: number,
  enabledMediaTypeCodes: readonly string[],
): Promise<AuthorDigitalProfile> {
  if (enabledMediaTypeCodes.length === 0) return EMPTY_AUTHOR_DIGITAL_PROFILE;

  const [row] = await db.execute<AuthorDigitalProfileRow>(sql`
    with recursive
    user_rated_items as (
      select distinct ${ratings.mediaItemId} as media_item_id, ${mediaItems.mediaType} as media_type
      from ${ratings}
      inner join ${mediaItems} on ${mediaItems.id} = ${ratings.mediaItemId}
      where ${ratings.authorId} = ${authorId}
        and ${mediaItems.publicationStatus} = ${PUBLISHED_PUBLICATION_STATUS}
        and ${getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes)}
    ),
    candidate_series as (
      select distinct linked.id, linked.parent_id, linked.code, linked.title
      from user_rated_items rated
      inner join ${mediaItemFranchises} link on link.media_item_id = rated.media_item_id
      inner join ${franchises} linked on linked.id = link.franchise_id
      where link.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
        and linked.publication_status = ${PUBLISHED_PUBLICATION_STATUS}

      union

      select parent.id, parent.parent_id, parent.code, parent.title
      from candidate_series candidate
      inner join ${franchises} parent on parent.id = candidate.parent_id
      where parent.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
    ),
    candidate_ancestors as (
      select candidate.id as series_id, candidate.id as ancestor_id, candidate.parent_id, 0 as distance
      from candidate_series candidate

      union all

      select path.series_id, parent.id, parent.parent_id, path.distance + 1
      from candidate_ancestors path
      inner join ${franchises} parent on parent.id = path.parent_id
      where parent.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
    ),
    candidate_depths as (
      select series_id, max(distance)::int as depth
      from candidate_ancestors
      group by series_id
    ),
    candidate_branches as (
      select candidate.id as series_id, candidate.id as descendant_id
      from candidate_series candidate

      union

      select branch.series_id, child.id
      from candidate_branches branch
      inner join ${franchises} child on child.parent_id = branch.descendant_id
      where child.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
    ),
    series_items as (
      select distinct branch.series_id, item.id as media_item_id, item.media_type
      from candidate_branches branch
      inner join ${mediaItemFranchises} link on link.franchise_id = branch.descendant_id
      inner join ${mediaItems} item on item.id = link.media_item_id
      where link.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
        and item.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
        and ${getMediaTypeCodeFilterSql(sql`item.media_type`, enabledMediaTypeCodes)}
    ),
    series_stats as (
      select
        candidate.id,
        candidate.code,
        candidate.title,
        depth.depth,
        count(distinct item.media_item_id)::int as total_count,
        count(distinct rated.media_item_id)::int as rated_count
      from candidate_series candidate
      inner join candidate_depths depth on depth.series_id = candidate.id
      inner join series_items item on item.series_id = candidate.id
      left join user_rated_items rated on rated.media_item_id = item.media_item_id
      group by candidate.id, candidate.code, candidate.title, depth.depth
    ),
    strongest_series as (
      select *
      from series_stats
      where rated_count > 0
      order by
        rated_count desc,
        rated_count::numeric / nullif(total_count, 0) desc,
        depth desc,
        title asc,
        id asc
      limit 1
    ),
    active_series as (
      select *
      from series_stats
      where rated_count >= 2 and rated_count < total_count
      order by
        rated_count desc,
        rated_count::numeric / nullif(total_count, 0) desc,
        depth desc,
        title asc,
        id asc
      limit 1
    ),
    best_known_type as (
      select rated.media_type as code, type.name, count(distinct rated.media_item_id)::int as rated_count
      from user_rated_items rated
      inner join ${mediaTypes} type on type.code = rated.media_type
      group by rated.media_type, type.name
      order by rated_count desc, rated.media_type asc
      limit 1
    ),
    familiar_items as (
      select distinct item.media_item_id, item.media_type
      from series_stats stats
      inner join series_items item on item.series_id = stats.id
      where stats.rated_count >= 2
    ),
    unexplored_type as (
      select
        item.media_type as code,
        type.name,
        count(distinct item.media_item_id)::int as total_count,
        count(distinct rated.media_item_id)::int as rated_count
      from familiar_items item
      inner join ${mediaTypes} type on type.code = item.media_type
      left join user_rated_items rated on rated.media_item_id = item.media_item_id
      group by item.media_type, type.name
      having count(distinct rated.media_item_id) < count(distinct item.media_item_id)
      order by
        count(distinct rated.media_item_id)::numeric / nullif(count(distinct item.media_item_id), 0) asc,
        item.media_type asc
      limit 1
    )
    select
      strongest.id::int as "strongestSeriesId",
      strongest.code as "strongestSeriesCode",
      strongest.title as "strongestSeriesTitle",
      coalesce(strongest.rated_count, 0)::int as "strongestSeriesCount",
      best_type.code as "bestKnownTypeCode",
      best_type.name as "bestKnownTypeName",
      unexplored.code as "unexploredTypeCode",
      unexplored.name as "unexploredTypeName",
      active.id::int as "activeSeriesId",
      active.code as "activeSeriesCode",
      active.title as "activeSeriesTitle",
      coalesce(active.rated_count, 0)::int as "seriesRated",
      coalesce(active.total_count, 0)::int as "seriesTotal"
    from (select 1) singleton
    left join strongest_series strongest on true
    left join best_known_type best_type on true
    left join unexplored_type unexplored on true
    left join active_series active on true
  `);

  if (!row) return EMPTY_AUTHOR_DIGITAL_PROFILE;

  return {
    strongestSeries: mapSeriesSummary({
      id: row.strongestSeriesId,
      code: row.strongestSeriesCode,
      title: row.strongestSeriesTitle,
    }),
    strongestSeriesCount: row.strongestSeriesCount ?? 0,
    bestKnownType: mapMediaTypeSummary({
      code: row.bestKnownTypeCode,
      name: row.bestKnownTypeName,
    }),
    unexploredType: mapMediaTypeSummary({
      code: row.unexploredTypeCode,
      name: row.unexploredTypeName,
    }),
    activeSeries: mapSeriesSummary({
      id: row.activeSeriesId,
      code: row.activeSeriesCode,
      title: row.activeSeriesTitle,
    }),
    seriesRated: row.seriesRated ?? 0,
    seriesTotal: row.seriesTotal ?? 0,
  };
}
