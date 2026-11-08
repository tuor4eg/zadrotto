import "server-only";

import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { authorMediaStatuses } from "@/db/schema";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import type { EditorialCollectionGroupItem } from "@/db/queries/editorial-collections";
import { FEED_KINDS, FEED_PAGE_SIZE, getFeedNavigation, type FeedItem, type FeedPosition } from "@/lib/feed/model";
import { resolveMediaItemDisplayTitles } from "@/lib/media/display-titles";
import { getTitlePartLabel, type TitlePartType } from "@/lib/media/title-parts";
import { resolveCoverUrl } from "@/lib/services/minio";
import { resolveAchievementImageUrl } from "@/lib/achievements/images";
import { resolveCollectionImageUrl } from "@/lib/collections/images";

type FeedInput = { oldest?: boolean; publicOnly?: boolean; pageSize?: number; mineOnly?: boolean; friendsOnly?: boolean; friendId?: number; authorId?: number; mediaTypeCodes: readonly string[]; position?: FeedPosition };
type FeedRow = {
  id: number; kind: number; at: string; title: string; original_title: string | null; aliases: string[];
  code: string; cover: string | null; thumb: string | null; actor_name: string | null; actor_id: number | null;
  score: number | null; part_type: TitlePartType | null; part_number: number | null; part_name: string | null;
  media_type_name: string | null; release_year: number | null; media_id: number | null; review_title: string | null; actor_is_friend: boolean;
};

function acceptedFeedFriends(authorId?: number): SQL {
  return authorId ? sql`
    select f.second_author_id id from author_friendships f join authors a on a.id=f.second_author_id
    where f.first_author_id=${authorId} and f.status='accepted' and a.blocked_at is null and not a.is_system
    union all
    select f.first_author_id id from author_friendships f join authors a on a.id=f.first_author_id
    where f.second_author_id=${authorId} and f.status='accepted' and a.blocked_at is null and not a.is_system
  ` : sql`select null::integer id where false`;
}

export async function getFeedFriends(authorId: number) {
  const rows = await db.execute<{ id: number; name: string }>(sql`
    select a.id,a.name from (${acceptedFeedFriends(authorId)}) friends
    join authors a on a.id=friends.id order by a.name,a.id
  `);
  return rows.map(row => ({ id: row.id, name: row.name }));
}

/** Identifiers below are a closed server-owned registry, never request values. */
export function buildFeedQuery(input: FeedInput): SQL {
  const pageSize = Number.isInteger(input.pageSize) && input.pageSize! > 0 ? Math.min(input.pageSize!, FEED_PAGE_SIZE) : FEED_PAGE_SIZE;
  const newer = input.position?.direction === "newer" || (!input.position && input.oldest === true);
  const order = sql.raw(newer ? "asc" : "desc");
  const types = input.mediaTypeCodes.length
    ? sql`media_items.media_type in (${sql.join(input.mediaTypeCodes.map(code => sql`${code}`), sql`, `)})`
    : sql`false`;
  const visibleMedia = sql`media_items.publication_status = 'published' and ${types}`;
  const bound = (time: SQL, kind: number, id: SQL) => input.position
    ? sql`and (${time}, ${kind}::int, ${id}) ${sql.raw(newer ? ">" : "<")} (${input.position.cursor.at}::timestamptz, ${input.position.cursor.kind}::int, ${input.position.cursor.id}::int)`
    : sql``;
  const top = (table: string, kind: number, joins: SQL, where: SQL, time = "created_at") => sql`(
    select ${sql.raw(`${table}.id`)} id, ${kind}::int kind, ${sql.raw(`${table}.${time}`)} occurred_at
    from ${sql.raw(table)} ${joins} where ${where}
    ${bound(sql.raw(`${table}.${time}`), kind, sql.raw(`${table}.id`))}
    order by ${sql.raw(`${table}.${time}`)} ${order}, ${sql.raw(`${table}.id`)} ${order} limit ${pageSize + 1}
  )`;
  const friends = sql`select id from (${acceptedFeedFriends(input.authorId)}) accepted
    where ${input.friendId === undefined ? sql`true` : sql`id=${input.friendId}`}`;
  const ownAuthor = input.authorId
    ? sql`select id from authors where id=${input.authorId} and blocked_at is null and not is_system`
    : sql`select null::integer id where false`;
  const actors = input.mineOnly ? ownAuthor
    : input.friendsOnly || input.friendId !== undefined ? sql`select id from friends`
    : sql`select id from friends union all ${ownAuthor}`;
  const actorTop = (table: string, kind: number, joins: SQL, where: SQL, authorColumn: string, time = "created_at") => sql`(
    select candidate.* from actors f cross join lateral ${top(table, kind, joins,
      sql`${sql.raw(`${table}.${authorColumn}`)}=f.id and ${where}`, time)} candidate
    order by occurred_at ${order}, id ${order} limit ${pageSize + 1}
  )`;
  const personal = (table: "ratings" | "author_media_statuses", kind: number) => actorTop(table, kind,
    sql`join media_items on media_items.id=${sql.raw(`${table}.media_item_id`)}`,
    sql`${visibleMedia} ${table === "author_media_statuses" ? sql`and author_media_statuses.status='wanted'` : sql``}`, "author_id", "updated_at");
  // Настройка видимости временно убрана из кабинета; проверка сохранена на будущее.
  const visibleActorId = sql`case when a.is_discoverable or a.id=${input.authorId ?? null} or exists(select 1 from friends where friends.id=a.id) then a.id else null end`;
  const reviewJoins = sql`join media_items on media_items.id=contributions.primary_media_item_id
    join contribution_reviews on contribution_reviews.contribution_id=contributions.id`;
  const visibleReview = sql`contributions.type='review' and contributions.status='published' and ${visibleMedia}`;
  const branches = [
    ...((!input.publicOnly && (input.mineOnly || input.friendsOnly || input.friendId !== undefined)) ? [
      actorTop("media_items", 1, sql``, visibleMedia, "created_by_author_id"),
      actorTop("franchises", 2, sql``, sql`franchises.publication_status='published'`, "created_by_author_id"),
      actorTop("contributions", 3, reviewJoins, visibleReview, "author_id"),
    ] : [
      top("media_items", 1, sql``, visibleMedia),
      top("franchises", 2, sql``, sql`franchises.publication_status='published'`),
      top("contributions", 3, reviewJoins, visibleReview),
      top("editorial_collections", 4, sql``, sql`editorial_collections.publication_status='published'`),
    ]),
    ...(!input.publicOnly ? [personal("ratings", 5), personal("author_media_statuses", 6),
      actorTop("user_achievements", 7, sql``, sql`true`, "author_id", "awarded_at")] : []),
  ];
  return sql`with friends as materialized (${friends}), actors as materialized (${actors}), candidates as materialized (
    select * from (${sql.join(branches, sql` union all `)}) sources
    order by occurred_at ${order}, kind ${order}, id ${order} limit ${pageSize + 1}
  ), selected as materialized (
    select * from candidates order by occurred_at ${order}, kind ${order}, id ${order} limit ${pageSize}
  ), details as (
    select e.id,e.kind,e.occurred_at,media_items.title,media_items.original_title,media_items.code,
      media_items.cover_url cover,media_items.cover_thumb_url thumb,a.name actor_name,${visibleActorId} actor_id,r.score,
      p.type part_type,p.number part_number,p.name part_name,cr.title review_title,
      coalesce((select jsonb_agg(value order by id) from media_item_title_aliases where media_item_id=media_items.id),'[]'::jsonb) aliases,media_items.id media_id,media_items.release_year release_year,
      (select name from media_types where code=media_items.media_type) media_type_name
    from selected e
    left join contributions c on e.kind=3 and c.id=e.id
    left join contribution_reviews cr on cr.contribution_id=c.id
    left join ratings r on e.kind=5 and r.id=e.id
    left join author_media_statuses w on e.kind=6 and w.id=e.id
    join media_items on media_items.id=case e.kind when 1 then e.id when 3 then c.primary_media_item_id when 5 then r.media_item_id when 6 then w.media_item_id end
    left join authors a on a.id=case e.kind when 1 then media_items.created_by_author_id when 3 then c.author_id when 5 then r.author_id when 6 then w.author_id end
      and a.blocked_at is null and not a.is_system
    left join title_parts p on p.id=case e.kind when 3 then c.part_id when 5 then r.part_id end
    where e.kind in (1,3,5,6)
    union all
    select e.id,e.kind,e.occurred_at,f.title,f.original_title,f.code,cover.cover_url,cover.cover_thumb_url,a.name,${visibleActorId},
      null::int,null::text,null::int,null::text,null::text,'[]'::jsonb,null::int,null::int,null::text
    from selected e join franchises f on e.kind=2 and f.id=e.id
    left join authors a on a.id=f.created_by_author_id and a.blocked_at is null and not a.is_system
    left join lateral (
      select media_items.cover_url,media_items.cover_thumb_url from media_item_franchises mf
      join media_items on media_items.id=mf.media_item_id
      where mf.franchise_id=f.id and mf.publication_status='published' and ${visibleMedia}
      order by mf.media_item_id desc limit 1
    ) cover on true
    union all
    select e.id,e.kind,e.occurred_at,c.title,null::text,c.slug,c.cover_object_key,null::text,null::text,null::int,
      null::int,null::text,null::int,null::text,null::text,'[]'::jsonb,null::int,null::int,null::text
    from selected e join editorial_collections c on e.kind=4 and c.id=e.id
    union all
    select e.id,e.kind,e.occurred_at,coalesce(al.name,ac.name),null::text,ua.author_id::text,
      al.image_object_key,null::text,a.name,${visibleActorId},null::int,null::text,
      case when exists(select 1 from achievement_levels other where other.achievement_id=al.achievement_id and other.level>1) then al.level else null end,
      null::text,null::text,'[]'::jsonb,null::int,null::int,null::text
    from selected e join user_achievements ua on e.kind=7 and ua.id=e.id
    join achievement_levels al on al.id=ua.achievement_level_id
    join achievements ac on ac.id=al.achievement_id
    join authors a on a.id=ua.author_id
  ) select coalesce(jsonb_agg(to_jsonb(d) - 'occurred_at' || jsonb_build_object('actor_is_friend', exists(select 1 from friends where friends.id=d.actor_id), 'at',
    to_char(d.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    order by d.occurred_at desc,d.kind desc,d.id desc),'[]'::jsonb) items,
    exists(select 1 from candidates offset ${pageSize}) has_more from details d`;
}

export async function getFeedPage(input: FeedInput) {
  const [result] = await db.execute<{ items: FeedRow[]; has_more: boolean }>(buildFeedQuery(input));
  const items: FeedItem[] = (result?.items ?? []).map(row => {
    const kind = FEED_KINDS[row.kind - 1];
    return {
      key: `${kind}-${row.id}`, kind, mediaItemId: row.media_id, mediaTypeName: row.media_type_name, releaseYear: row.release_year, cursor: { at: row.at, kind: row.kind, id: row.id },
      title: resolveMediaItemDisplayTitles({ title: row.title, originalTitle: row.original_title, aliases: row.aliases }).displayTitle,
      href: kind === "series" ? `/archive?series=${encodeURIComponent(row.code)}`
        : kind === "achievement" ? `/users/${row.code}/achievements` : kind === "collection" ? `/collections/${row.code}` : kind === "review" ? `/reviews/${row.id}` : `/media/${row.code}`,
      imageUrl: kind === "achievement" ? resolveAchievementImageUrl(row.cover) : kind === "collection" ? resolveCollectionImageUrl(row.cover) : resolveCoverUrl(row.thumb) ?? resolveCoverUrl(row.cover),
      actorName: row.actor_name, actorId: row.actor_id, actorIsFriend: row.actor_is_friend, score: row.score,
      partLabel: kind === "achievement" ? (row.part_number === null ? null : `Ур. ${row.part_number}`) : row.part_type !== null && row.part_number !== null ? getTitlePartLabel({ type: row.part_type, number: row.part_number, name: row.part_name }) : null,
      reviewTitle: row.review_title,
    };
  });
  return { items, ...getFeedNavigation(items, input.position, result?.has_more ?? false, input.oldest) };
}

/** Hydrate only the current page, deduplicated across events, using bounded batch reads. */
export async function getFeedMediaTiles(items: readonly FeedItem[], authorId?: number): Promise<EditorialCollectionGroupItem[]> {
  const ids = [...new Set(items.flatMap(item => item.mediaItemId ? [item.mediaItemId] : []))];
  if (!ids.length) return [];
  const [tiles, statuses] = await Promise.all([
    getMediaItemTilesByIds(ids, authorId),
    authorId ? db.select({ mediaItemId: authorMediaStatuses.mediaItemId, status: authorMediaStatuses.status })
      .from(authorMediaStatuses)
      .where(and(eq(authorMediaStatuses.authorId, authorId), inArray(authorMediaStatuses.mediaItemId, ids))) : [],
  ]);
  const statusById = new Map(statuses.map(row => [row.mediaItemId, row.status]));
  return tiles.map(item => ({ mediaItemId: item.id, item, currentAuthorStatus: statusById.get(item.id) ?? null }));
}
