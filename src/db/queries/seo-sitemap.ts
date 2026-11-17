import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { visibleGenreSql } from "@/db/queries/media-item-genres";
import { SITEMAP_BUCKET_SIZE, SITEMAP_CATEGORIES, sitemapEntryPath, sitemapRange, type SitemapCategory } from "@/lib/seo/sitemap";

// All identifiers are server-owned. EXISTS avoids relationship fan-out and hydration.
function source(category: SitemapCategory): { table: SQL; key: SQL; visible: SQL } {
  const publicMedia = sql`m.publication_status='published' and mt.is_publicly_available`;
  switch (category) {
    case "media": return { table: sql`media_items e`, key: sql`e.code`, visible: sql`e.publication_status='published' and exists (select 1 from media_types mt where mt.code=e.media_type and mt.is_publicly_available)` };
    case "reviews": return { table: sql`contributions e`, key: sql`e.id::text`, visible: sql`e.type='review' and e.status='published' and exists (select 1 from contribution_reviews r where r.contribution_id=e.id) and exists (select 1 from authors a where a.id=e.author_id) and exists (select 1 from media_items m join media_types mt on mt.code=m.media_type where m.id=e.primary_media_item_id and ${publicMedia})` };
    case "collections": return { table: sql`editorial_collections e`, key: sql`e.slug`, visible: sql`e.publication_status='published'` };
    case "series": return { table: sql`franchises e`, key: sql`e.code`, visible: sql`e.publication_status='published'` };
    case "genres": return { table: sql`genres e`, key: sql`e.slug`, visible: sql`e.is_active and exists (select 1 from media_item_genres link join media_items m on m.id=link.media_item_id join media_types mt on mt.code=m.media_type where link.genre_id=e.id and ${publicMedia} and ${visibleGenreSql(sql`m.id`, sql`e.replacement_franchise_id`)})` };
    case "platforms": return { table: sql`platforms e`, key: sql`e.slug`, visible: sql`e.is_active and exists (select 1 from media_item_platforms link join media_items m on m.id=link.media_item_id join media_types mt on mt.code=m.media_type where link.platform_id=e.id and m.media_type='game' and ${publicMedia})` };
    case "creators": return { table: sql`creators e`, key: sql`e.slug`, visible: sql`exists (select 1 from (
      select ec.entry_id from entry_creators ec where ec.creator_id=e.id
      union all select p.entry_id from entry_creator_pseudonyms p join creator_roles r on r.id=p.role_id and r.code='writer' where p.creator_id=e.id
      union all select ec.entry_id from creator_relations cr join entry_creators ec on ec.creator_id=cr.source_creator_id join creator_roles r on r.id=ec.role_id and r.code='writer' where cr.target_creator_id=e.id and cr.relation_type='pseudonym_of'
      union all select p.entry_id from creator_relations cr join entry_creator_pseudonyms p on p.creator_id=cr.source_creator_id join creator_roles r on r.id=p.role_id and r.code='writer' where cr.target_creator_id=e.id and cr.relation_type='pseudonym_of'
    ) membership join media_items m on m.id=membership.entry_id join media_types mt on mt.code=m.media_type where ${publicMedia})` };
  }
}

export function sitemapBucketsQuery() {
  return sql.join(SITEMAP_CATEGORIES.map((category) => {
    const { table, visible } = source(category);
    return sql`select ${category}::text as category, ((e.id - 1) / ${SITEMAP_BUCKET_SIZE})::int as page from ${table} where ${visible} group by 2`;
  }), sql` union all `);
}

export async function getSitemapBuckets() {
  const rows = await db.execute<{ category: SitemapCategory; page: number }>(sitemapBucketsQuery());
  return [...rows].sort((left, right) => SITEMAP_CATEGORIES.indexOf(left.category) - SITEMAP_CATEGORIES.indexOf(right.category) || left.page - right.page);
}

export function sitemapEntriesQuery(category: SitemapCategory, page: number) {
  const { first, last } = sitemapRange(page);
  const { table, key, visible } = source(category);
  return sql`select e.id, ${key} as key, e.updated_at as "updatedAt" from ${table} where e.id >= ${first} and e.id <= ${last} and ${visible} order by e.id limit ${SITEMAP_BUCKET_SIZE}`;
}

export async function getSitemapEntries(category: SitemapCategory, page: number) {
  const rows = await db.execute<{ id: number; key: string; updatedAt: Date | string }>(sitemapEntriesQuery(category, page));
  return rows.map((row) => ({ url: sitemapEntryPath(category, row.key), updatedAt: row.updatedAt }));
}
