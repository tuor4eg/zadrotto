import { eq, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems } from "@/db/schema";
import { normalizeSearchSql } from "@/db/search";

export type AnimeCreatorDisplayRow = { name: string; creatorId: number | null; slug: string | null };
export type AnimeCreatorDisplay = {
  directors: AnimeCreatorDisplayRow[];
  productionCompanies: AnimeCreatorDisplayRow[];
  producers: AnimeCreatorDisplayRow[];
};

/** Reads working relationships and durable requests, including manual participation. */
export function animeCreatorRoleJsonSql(roleCode: "director" | "production_company" | "producer", entryId: SQLWrapper = sql`"media_items"."id"`) {
  return sql<AnimeCreatorDisplayRow[]>`coalesce((select jsonb_agg(jsonb_build_object(
    'name', company.name, 'creatorId', company.creator_id, 'slug', company.slug)
    order by company.position nulls last, company.name, company.identity)
    from (
      select coalesce(c.name_ru, c.name) as name, c.id as creator_id, c.slug, 'creator:' || c.id as identity,
        min(s.source_position) as position
      from entry_creators ec join creator_roles role on role.id=ec.role_id and role.code=${roleCode}
      join creators c on c.id=ec.creator_id
      left join entry_creator_sources s on s.entry_id=ec.entry_id and s.creator_id=ec.creator_id and s.role_id=ec.role_id
      where ec.entry_id=${entryId} and (ec.is_manual or exists (
        select 1 from entry_creator_sources valid
        left join provider_creator_bindings binding on binding.id=valid.binding_id
        left join creator_requests source_request on source_request.provider='anilist' and valid.provider='anilist'
          and source_request.external_creator_id=binding.external_creator_id
        left join creator_request_media_items source_roster on source_roster.request_id=source_request.id
          and source_roster.media_item_id=valid.entry_id and source_roster.role_id=valid.role_id
        where valid.entry_id=ec.entry_id and valid.creator_id=ec.creator_id and valid.role_id=ec.role_id
        and (valid.binding_id is null or binding.active)
        and not exists (select 1 from provider_creator_exclusions excluded
          where excluded.provider=valid.provider and excluded.external_creator_id=binding.external_creator_id)
        and not exists (select 1 from provider_creator_exclusions excluded
          where excluded.provider=valid.provider and excluded.external_creator_id is null
            and valid.provider='anilist' and excluded.media_type=${"anime"}
            and excluded.normalized_external_creator_name=${normalizeSearchSql(sql`coalesce(source_roster.external_creator_name, binding.external_creator_name, valid.normalized_external_creator_name)`)})
        and not exists (select 1 from creator_requests reopened where reopened.provider=valid.provider
          and reopened.external_creator_id=binding.external_creator_id and reopened.manually_reopened and reopened.decision is null)
      )) group by c.id, c.name, c.name_ru, c.slug
      union all
      select roster.external_creator_name, null::integer, null::text, request.external_creator_id, roster.source_position
      from creator_request_media_items roster
      join creator_requests request on request.id=roster.request_id and request.provider='anilist'
      join creator_roles role on role.id=roster.role_id and role.code=${roleCode}
      where roster.media_item_id=${entryId} and request.decision is distinct from 'exclude'
        and not exists (select 1 from provider_creator_exclusions excluded where excluded.provider='anilist'
          and excluded.external_creator_id=request.external_creator_id)
        and not exists (select 1 from provider_creator_exclusions excluded where excluded.provider='anilist'
          and excluded.external_creator_id is null and excluded.media_type=${"anime"}
          and excluded.normalized_external_creator_name=${normalizeSearchSql(sql`roster.external_creator_name`)})
        and (request.decision is null or not exists (
          select 1 from provider_creator_bindings binding join entry_creators ec
            on ec.creator_id=binding.creator_id and ec.entry_id=roster.media_item_id and ec.role_id=roster.role_id
          where binding.provider='anilist' and binding.external_creator_id=request.external_creator_id and binding.active
        ))
    ) company), '[]'::jsonb)`;
}

export async function getAnimeCreatorDisplay(mediaItemId: number): Promise<AnimeCreatorDisplay | undefined> {
  const [row] = await db.select({
    directors: animeCreatorRoleJsonSql("director"),
    productionCompanies: animeCreatorRoleJsonSql("production_company"),
    producers: animeCreatorRoleJsonSql("producer"),
  }).from(mediaItems).where(eq(mediaItems.id, mediaItemId));
  return row;
}
