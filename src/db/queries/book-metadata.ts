import { sql, type SQLWrapper } from "drizzle-orm";
import { mediaItemMetadata, mediaItems } from "@/db/schema";
import { filmCompaniesJsonSql } from "@/db/queries/tmdb-company-display";

/** Uses working relations only. Raw provider snapshots are never a rendering dependency. */
export function bookSnapshotProviderSql(provider: SQLWrapper = mediaItemMetadata.sourceProvider) {
  return sql`${provider} in ('fantlab', 'google-books', 'open-library')`;
}

export function bookContributorNamesSql(roleCode: "writer" | "publisher", entryId: SQLWrapper = mediaItems.id, sourceProvider: SQLWrapper = mediaItemMetadata.sourceProvider) {
  return sql`coalesce((select jsonb_agg(ordered.name order by ordered.position nulls last, ordered.name, ordered.creator_id)
    from (select c.id as creator_id, coalesce(c.name_ru, c.name) as name, min(s.source_position) as position
      from entry_creators ec join creators c on c.id=ec.creator_id join creator_roles r on r.id=ec.role_id
      left join entry_creator_sources s on s.entry_id=ec.entry_id and s.creator_id=ec.creator_id
        and s.role_id=ec.role_id and s.provider=${sourceProvider}
      where ec.entry_id=${entryId} and r.code=${roleCode}
      group by c.id, c.name, c.name_ru) ordered), '[]'::jsonb)`;
}

/** Compatibility read shape for consumers, not a new persisted facts projection. */
export function mediaMetadataFactsSql(input: {
  entryId?: SQLWrapper;
  mediaType?: SQLWrapper;
  provider?: SQLWrapper;
  facts?: SQLWrapper;
} = {}) {
  const { entryId = mediaItems.id, mediaType = mediaItems.mediaType, provider = mediaItemMetadata.sourceProvider, facts = mediaItemMetadata.facts } = input;
  return sql<Record<string, unknown> | null>`case when ${mediaType}='book' and ${bookSnapshotProviderSql(provider)}
    then jsonb_strip_nulls(jsonb_build_object(
      'authors', nullif(${bookContributorNamesSql("writer", entryId, provider)}, '[]'::jsonb),
      'publishers', nullif(${bookContributorNamesSql("publisher", entryId, provider)}, '[]'::jsonb),
      'originalLanguage', ${facts}->'originalLanguage'
    )) when ${mediaType}='film' and ${provider}='tmdb' and not coalesce(${facts} ? 'productionCompanies', false)
    then coalesce(${facts}, '{}'::jsonb) || jsonb_build_object('productionCompanies',
      coalesce((select jsonb_agg(company->>'name') from jsonb_array_elements(${filmCompaniesJsonSql(entryId)}) company), '[]'::jsonb))
    else ${facts} end`;
}
