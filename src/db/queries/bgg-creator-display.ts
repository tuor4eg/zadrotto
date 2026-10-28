import { sql, type SQLWrapper } from "drizzle-orm";

/** Working participation and pending occurrences only; never fetch or parse provider XML. */
export function bggCreatorNamesSql(roleCode: "designer" | "artist", entryId: SQLWrapper) {
  return sql`coalesce((select jsonb_agg(names.name order by names.name) from (
    select coalesce(c.name_ru,c.name) as name
    from entry_creators ec join creators c on c.id=ec.creator_id
    join creator_roles role on role.id=ec.role_id
    where ec.entry_id=${entryId} and role.code=${roleCode}
    union
    select occurrence.external_creator_name as name
    from creator_request_media_items occurrence
    join creator_requests request on request.id=occurrence.request_id
    join creator_roles role on role.id=occurrence.role_id
    where occurrence.media_item_id=${entryId} and request.provider='bgg'
      and request.media_type='boardgame' and request.decision is null and role.code=${roleCode}
  ) names), '[]'::jsonb)`;
}
