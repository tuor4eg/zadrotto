import { sql, type SQLWrapper } from "drizzle-orm";
import { mediaItemMetadata, mediaItems, providerSettings } from "@/db/schema";

/** Uses working relations only. Raw provider snapshots are never a rendering dependency. */
export function normalizedBookProviderSql(provider: SQLWrapper = mediaItemMetadata.sourceProvider) {
  return sql`exists(select 1 from ${providerSettings} book_provider_settings
    where book_provider_settings.media_type='book' and book_provider_settings.provider_code=${provider}
    and book_provider_settings.normalized_book_metadata=true)`;
}

export function bookContributorNamesSql(roleCode: "writer" | "publisher", entryId: SQLWrapper = mediaItems.id, sourceProvider: SQLWrapper = mediaItemMetadata.sourceProvider) {
  return sql`coalesce((select jsonb_agg(ordered.name order by ordered.position nulls last, ordered.name, ordered.creator_id)
    from (select c.id as creator_id, c.name, min(s.source_position) as position
      from entry_creators ec join creators c on c.id=ec.creator_id join creator_roles r on r.id=ec.role_id
      left join entry_creator_sources s on s.entry_id=ec.entry_id and s.creator_id=ec.creator_id
        and s.role_id=ec.role_id and s.provider=${sourceProvider}
      where ec.entry_id=${entryId} and r.code=${roleCode}
      group by c.id, c.name) ordered), '[]'::jsonb)`;
}

/** Compatibility read shape for consumers, not a new persisted facts projection. */
export function mediaMetadataFactsSql(input: {
  entryId?: SQLWrapper;
  mediaType?: SQLWrapper;
  provider?: SQLWrapper;
  facts?: SQLWrapper;
  originalLanguage?: SQLWrapper;
} = {}) {
  const { entryId = mediaItems.id, mediaType = mediaItems.mediaType, provider = mediaItemMetadata.sourceProvider, facts = mediaItemMetadata.facts, originalLanguage = mediaItemMetadata.originalLanguage } = input;
  return sql<Record<string, unknown> | null>`case when ${mediaType}='book' and ${normalizedBookProviderSql(provider)}
    then jsonb_strip_nulls(jsonb_build_object(
      'authors', nullif(${bookContributorNamesSql("writer", entryId, provider)}, '[]'::jsonb),
      'publishers', nullif(${bookContributorNamesSql("publisher", entryId, provider)}, '[]'::jsonb),
      'originalLanguage', ${originalLanguage}
    )) else ${facts} end`;
}
