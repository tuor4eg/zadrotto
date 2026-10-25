import type { CreatorLocalizationFilter, CreatorProviderFilter } from "@/lib/creators/editor";
import { getImportedCreatorNameLocalization } from "@/lib/creators/name-localization";
import { creatorDisplayNameSql, creatorNameSearchSql } from "./creator-display";
import { enqueueCreatorImageFill } from "./creator-image-jobs";
import { deleteEntitySnapshotLinks } from "@/db/queries/provider-snapshots";
import { and, asc, eq, inArray, isNotNull, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { adminActivityLogs, creatorRelations, entryCreatorPseudonyms, creators, creatorTypes, creatorRoles, creatorSeries, franchises, entryCreators, entryCreatorSources, providerCreatorMappings, providerCreatorBindings, mediaItems, mediaItemFranchises } from "@/db/schema";
import { normalizeSearchSql } from "@/db/search";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { EntryCreator } from "@/lib/media/creators";
import { paginatePublicCreators } from "@/lib/media/public-creators";
import { ARCHIVE_SEARCH_MATCH_LIMIT } from "@/lib/archive/search-matches";
import { bookSnapshotProviderSql } from "@/db/queries/book-metadata";
import { parseCreatorDate, type CreatorLifeDates } from "@/lib/creators/life-dates";

export async function searchArchiveCreatorMatches(searchQuery: string, enabledMediaTypeCodes: readonly string[]) {
    const search = normalizeSearchText(searchQuery);
    if (!search || !enabledMediaTypeCodes.length) {
        return { items: [] as { id: number; name: string; slug: string }[], totalCount: 0 };
    }
    // Probe candidate creators' indexed relationships, never scan all entries per name match.
    const rows = await db.execute<{ id: number; name: string; slug: string; totalCount: number }>(sql`
        select c.id, coalesce(c.name_ru,c.name) as name, c.slug, count(*) over()::int as "totalCount"
        from creators c join creator_types ct on ct.id=c.type_id
        where ${creatorNameSearchSql(search, { name: sql`c.name`, nameRu: sql`c.name_ru`, originalName: sql`c.original_name` })}
          and exists (
            select 1 from (
              select ec.entry_id from entry_creators ec where ec.creator_id=c.id
              union all
              select p.entry_id from entry_creator_pseudonyms p
                where p.creator_id=c.id and p.role_id=(select id from creator_roles where code='writer')
              union all
              select ec.entry_id from creator_relations cr join entry_creators ec on ec.creator_id=cr.source_creator_id
                where cr.target_creator_id=c.id and cr.relation_type='pseudonym_of'
                  and ec.role_id=(select id from creator_roles where code='writer')
              union all
              select p.entry_id from creator_relations cr join entry_creator_pseudonyms p on p.creator_id=cr.source_creator_id
                where cr.target_creator_id=c.id and cr.relation_type='pseudonym_of'
                  and p.role_id=(select id from creator_roles where code='writer')
            ) membership
            join media_items m on m.id=membership.entry_id join media_types mt on mt.code=m.media_type
            where m.publication_status='published' and mt.is_publicly_available
              and ${inArray(sql`m.media_type`, [...enabledMediaTypeCodes])}
          )
        order by coalesce(c.name_ru,c.name), c.id limit ${ARCHIVE_SEARCH_MATCH_LIMIT}`);
    return {
        items: rows.map(({ id, name, slug }) => ({ id, name, slug })),
        totalCount: rows[0]?.totalCount ?? 0,
    };
}

/** Materialize public memberships once, including the existing one-way writer pseudonym expansion. */
function publicCreatorMembershipSql(mediaType?: string) {
    return sql`with public_entries as materialized (
        select m.id from media_items m join media_types mt on mt.code=m.media_type
        where m.publication_status='published' and mt.is_publicly_available
        ${mediaType ? sql`and m.media_type=${mediaType}` : sql``}
    ), assigned as materialized (
        select ec.entry_id, ec.creator_id, ec.role_id from entry_creators ec
        join public_entries m on m.id=ec.entry_id
        union
        select p.entry_id, p.creator_id, p.role_id from entry_creator_pseudonyms p
        join public_entries m on m.id=p.entry_id join creator_roles r on r.id=p.role_id where r.code='writer'
    ), membership as materialized (
        select * from assigned
        union
        select a.entry_id, cr.target_creator_id, a.role_id from assigned a
        join creator_roles r on r.id=a.role_id and r.code='writer'
        join creator_relations cr on cr.source_creator_id=a.creator_id and cr.relation_type='pseudonym_of'
    )`;
}

export async function getPublicCreatorMediaTypeTabs() {
    return db.execute<{ code: string; name: string; creatorsCount: number }>(sql`
        ${publicCreatorMembershipSql()}, counts as (
            select m.media_type, count(distinct membership.creator_id)::int as total
            from membership join media_items m on m.id=membership.entry_id group by m.media_type
        )
        select mt.code, mt.name, coalesce(c.total, 0)::int as "creatorsCount"
        from media_types mt left join counts c on c.media_type=mt.code
        where mt.is_publicly_available and coalesce(c.total, 0) > 0
        order by "creatorsCount" desc, mt.name, mt.code`);
}

export async function getPublicCreatorsPage(input: {
    page: number; pageSize: number; letter?: string; mediaType?: string; searchQuery: string;
}) {
    const search = normalizeSearchText(input.searchQuery);
    const rows = await db.execute<{
        id: number; name: string; slug: string; avatarObjectKey: string | null;
        roles: { code: string; name: string }[]; nameMatches: boolean; mediaItemsCount: number;
    }>(sql`${publicCreatorMembershipSql(input.mediaType)}, counts as (
        select creator_id, count(distinct entry_id)::int as total from membership group by creator_id
    ), role_pairs as (
        select distinct creator_id, role_id from membership
    ), role_lists as (
        select p.creator_id, jsonb_agg(jsonb_build_object('code', r.code, 'name', r.name) order by r.name, r.id) as roles
        from role_pairs p join creator_roles r on r.id=p.role_id group by p.creator_id
    )
    select c.id, coalesce(c.name_ru, c.name) as name, c.slug, c.avatar_object_key as "avatarObjectKey", rl.roles,
        ${search ? creatorNameSearchSql(search, { name: sql`c.name`, nameRu: sql`c.name_ru`, originalName: sql`c.original_name` }) : sql`true`} as "nameMatches",
        counts.total as "mediaItemsCount"
    from creators c join creator_types ct on ct.id=c.type_id
    join counts on counts.creator_id=c.id join role_lists rl on rl.creator_id=c.id`);
    return paginatePublicCreators(rows, input);
}
export type CreatorTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getCreatorRelatedSeriesIds(creatorId: number) {
    const rows = await db.selectDistinct({ id: mediaItemFranchises.franchiseId })
        .from(entryCreators)
        .innerJoin(creatorRoles, eq(creatorRoles.id, entryCreators.roleId))
        .innerJoin(mediaItemFranchises, eq(mediaItemFranchises.mediaItemId, entryCreators.entryId))
        .where(and(
            eq(entryCreators.creatorId, creatorId),
            eq(mediaItemFranchises.publicationStatus, "published"),
        )).orderBy(asc(mediaItemFranchises.franchiseId));
    return rows.map(row => row.id);
}

export type EntryRoleCreatorLink = { id: number; name: string; slug: string; roleCode: string; roleName: string };

/** Generic roles are direct assignments; book pseudonym display stays in the writer API. */
export function entryCreatorsJsonSql(column: SQLWrapper = sql`"media_items"."id"`) {
    return sql<EntryRoleCreatorLink[]>`coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', coalesce(c.name_ru, c.name), 'slug', c.slug, 'roleCode', r.code, 'roleName', r.name
    ) order by r.name, coalesce(c.name_ru, c.name), c.id)
    from entry_creators ec join creators c on c.id=ec.creator_id join creator_roles r on r.id=ec.role_id
    where ec.entry_id=${column}), '[]'::jsonb)`;
}

export async function getCreatorProviderBindings(creatorId: number | readonly number[], includeInactive = false) {
    const ids = typeof creatorId === "number" ? [creatorId] : [...creatorId];
    if (!ids.length) return [];
    return db.select().from(providerCreatorBindings).where(and(inArray(providerCreatorBindings.creatorId, ids), includeInactive ? undefined : eq(providerCreatorBindings.active, true)))
      .orderBy(asc(providerCreatorBindings.provider), asc(providerCreatorBindings.externalCreatorId));
}

export function entryWriterCreatorsJsonSql(column: SQLWrapper = sql `"media_items"."id"`) {
    return sql<{
        id: number;
        name: string;
        slug: string;
    }[]> `coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', coalesce(c.name_ru, c.name), 'slug', c.slug) order by coalesce(c.name_ru, c.name), c.id)
    from creators c where c.id in (
      select ec.creator_id from entry_creators ec join creator_roles r on r.id=ec.role_id
      where ec.entry_id=${column} and r.code='writer' and not exists (
        select 1 from entry_creator_pseudonyms p join creator_relations cr on cr.source_creator_id=p.creator_id
        where p.entry_id=ec.entry_id and cr.target_creator_id=ec.creator_id and cr.relation_type='pseudonym_of')
      union select p.creator_id from entry_creator_pseudonyms p where p.entry_id=${column}
    )), '[]'::jsonb)`;
}
/** Metadata facts expose accepted provider authors, independently of the display pseudonym. */
export function entryProviderWriterCreatorsJsonSql(column: SQLWrapper = sql`"media_items"."id"`) {
    return sql<{ id: number; name: string; slug: string }[]>`coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', coalesce(c.name_ru, c.name), 'slug', c.slug)
        order by provider_authors.position nulls last, coalesce(c.name_ru, c.name), c.id)
      from creators c join (
        select s.creator_id, min(case when ${bookSnapshotProviderSql(sql`md.source_provider`)} then s.source_position else coalesce(author.ordinality, case when s.provider='fantlab' and s.normalized_external_creator_name like 'fantlab:%' then s.source_position end) end) as position
        from entry_creator_sources s join creator_roles r on r.id=s.role_id
        join media_item_metadata md on md.media_item_id=s.entry_id
        left join lateral jsonb_array_elements_text(case when ${bookSnapshotProviderSql(sql`md.source_provider`)} then '[]'::jsonb else case jsonb_typeof(md.facts->'authors')
          when 'array' then md.facts->'authors'
          when 'string' then jsonb_build_array(md.facts->'authors')
          else '[]'::jsonb end end) with ordinality as author(name, ordinality)
          on ${normalizeSearchSql(sql`author.name`)}=s.normalized_external_creator_name
        where s.entry_id=${column} and r.code='writer'
          and s.provider=md.source_provider
        group by s.creator_id
      ) provider_authors on provider_authors.creator_id=c.id
    ), '[]'::jsonb)`;
}
export async function getCreatorTypes() {
    return db.select().from(creatorTypes).orderBy(asc(creatorTypes.name));
}
export async function getCreatorRoles() {
    return db.select().from(creatorRoles).orderBy(asc(creatorRoles.name));
}
export async function getCreatorOptions() {
    return db.select({ id: creators.id, name: creatorDisplayNameSql(), originalName: creators.originalName, birthDate: creators.birthDate, deathDate: creators.deathDate, slug: creators.slug, typeId: creators.typeId, typeCode: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).orderBy(asc(creatorDisplayNameSql()));
}
export async function getCreators(input: {
    q?: string;
    page?: number;
    pageSize?: number;
    publicOnly?: boolean;
    localization?: CreatorLocalizationFilter;
    provider?: CreatorProviderFilter;
    typeCode?: string;
    roleCode?: string;
} = {}) {
    const q = normalizeSearchText(input.q ?? "");
    const filter = and(
        input.provider ? sql`${creators.id} in (
            select b.creator_id from provider_creator_bindings b where b.provider=${input.provider} and b.active
            union
            select m.creator_id from provider_creator_mappings m where m.provider=${input.provider}
        )` : undefined,
        input.localization ? isNotNull(creators.nameRu) : undefined,
        input.localization === "ai" ? eq(creators.nameRuSource, "ai") : undefined,
        q ? creatorNameSearchSql(q) : undefined,
        input.typeCode ? eq(creatorTypes.code, input.typeCode) : undefined,
        input.roleCode ? sql`${creators.id} in (
            select ec.creator_id from entry_creators ec join creator_roles r on r.id=ec.role_id where r.code=${input.roleCode}
            union
            select p.creator_id from entry_creator_pseudonyms p join creator_roles r on r.id=p.role_id where r.code='writer' and r.code=${input.roleCode}
            union
            select cr.target_creator_id from (
                select ec.creator_id, ec.role_id from entry_creators ec
                union select p.creator_id, p.role_id from entry_creator_pseudonyms p
            ) a join creator_roles r on r.id=a.role_id
            join creator_relations cr on cr.source_creator_id=a.creator_id and cr.relation_type='pseudonym_of'
            where r.code='writer' and r.code=${input.roleCode}
        )` : undefined,
        input.publicOnly ? sql `exists (select 1 from media_items m join media_types mt on mt.code=m.media_type where ${creatorCondition(creators.id, sql`m.id`)} and m.publication_status = 'published' and mt.is_publicly_available)` : undefined,
    );
    const [count] = await db.select({ totalCount: sql<number> `count(*)::int` }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(filter);
    const pageSize = Math.max(1, Math.min(100, input.pageSize ?? 25));
    const totalPages = Math.max(1, Math.ceil(count.totalCount / pageSize));
    const page = Math.min(totalPages, Math.max(1, Math.trunc(input.page ?? 1)));
    const items = await db.select({ id: creators.id, name: creatorDisplayNameSql(), sourceName: creators.name, originalName: creators.originalName, slug: creators.slug, typeId: creators.typeId, typeCode: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(filter).orderBy(asc(creatorDisplayNameSql()), asc(creators.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { items, page, pageSize, totalCount: count.totalCount, totalPages };
}
/** Social link identity: no memberships, counts, roles or series traversal. */
export async function getCreatorLinkIdentityBySlug(slug: string) {
    const [creator] = await db.select({ name: creatorDisplayNameSql(), slug: creators.slug, avatarObjectKey: creators.avatarObjectKey })
        .from(creators).where(eq(creators.slug, slug)).limit(1);
    return creator ?? null;
}

export async function getCreatorBySlug(slug: string) {
    const [creator] = await db.select({ id: creators.id, name: creatorDisplayNameSql(), avatarObjectKey: creators.avatarObjectKey, originalName: creators.originalName, slug: creators.slug, typeId: creators.typeId, typeCode: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.slug, slug));
    if (!creator)
        return null;
    const [series, pseudonymAuthors, pseudonyms, roles] = await Promise.all([
        db.selectDistinct({ id: franchises.id, code: franchises.code, title: franchises.title }).from(creatorSeries).innerJoin(franchises, eq(franchises.id, creatorSeries.seriesId)).where(and(
            or(eq(creatorSeries.creatorId, creator.id), sql`exists (select 1 from creator_relations cr where cr.source_creator_id=${creatorSeries.creatorId} and cr.target_creator_id=${creator.id} and cr.relation_type='pseudonym_of')`),
            eq(franchises.publicationStatus, "published"),
        )).orderBy(asc(franchises.title), asc(franchises.id)),
        db.select({ id: creators.id, name: creatorDisplayNameSql(), slug: creators.slug })
            .from(creatorRelations).innerJoin(creators, eq(creators.id, creatorRelations.targetCreatorId))
            .where(and(eq(creatorRelations.sourceCreatorId, creator.id), eq(creatorRelations.relationType, "pseudonym_of")))
            .orderBy(asc(creatorDisplayNameSql()), asc(creators.id)),
        db.select({ id: creators.id, name: creatorDisplayNameSql(), slug: creators.slug })
            .from(creatorRelations).innerJoin(creators, eq(creators.id, creatorRelations.sourceCreatorId))
            .where(and(eq(creatorRelations.targetCreatorId, creator.id), eq(creatorRelations.relationType, "pseudonym_of")))
            .orderBy(asc(creatorDisplayNameSql()), asc(creators.id)),
        db.execute<{ code: string; name: string }>(sql`${publicCreatorMembershipSql()}
            select distinct r.code, r.name from membership m join creator_roles r on r.id=m.role_id
            where m.creator_id=${creator.id} order by r.name, r.code`),
    ]);
    return { ...creator, series, pseudonymAuthors, pseudonyms, roles };
}
export async function getAdminCreators() {
    const rows = await getCreatorOptions();
    const [variants, series] = await Promise.all([db.select().from(providerCreatorMappings), db.select().from(creatorSeries)]);
    return rows.map(c => ({ ...c, providerVariants: variants.filter(v => v.creatorId === c.id).map(v => ({ ...v, mappingId: v.id })), seriesIds: series.filter(s => s.creatorId === c.id).map(s => s.seriesId) }));
}
export async function getCreatorProviderVariants(creatorIds: readonly number[]) {
    if (!creatorIds.length) return [];
    return db.select().from(providerCreatorMappings)
        .where(inArray(providerCreatorMappings.creatorId, [...creatorIds]))
        .orderBy(asc(providerCreatorMappings.provider), asc(providerCreatorMappings.externalCreatorName));
}
export async function getAdminCreatorById(id: number) {
    const [creator] = await db.select({ id: creators.id, name: creators.name, nameRu: creators.nameRu, nameRuSource: creators.nameRuSource, nameRuProcessed: creators.nameRuProcessed, originalName: creators.originalName,
      birthDate: creators.birthDate, deathDate: creators.deathDate, slug: creators.slug, typeId: creators.typeId, typeCode: creatorTypes.code,
      hasPseudonymAssignments: sql<boolean>`exists(select 1 from entry_creator_pseudonyms p where p.creator_id=${creators.id})` })
      .from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, id));
    if (!creator) return null;
    const [relations, incomingRelations, inheritedSeries, providerVariants, directSeries, roles] = await Promise.all([
        db.select({ targetCreatorId: creatorRelations.targetCreatorId, relationType: creatorRelations.relationType, name: creatorDisplayNameSql() })
          .from(creatorRelations).innerJoin(creators, eq(creators.id, creatorRelations.targetCreatorId))
          .where(eq(creatorRelations.sourceCreatorId, id)),
        db.select({ sourceCreatorId: creatorRelations.sourceCreatorId, name: creatorDisplayNameSql(), relationType: creatorRelations.relationType })
            .from(creatorRelations).innerJoin(creators, eq(creators.id, creatorRelations.sourceCreatorId)).where(eq(creatorRelations.targetCreatorId, id)),
        db.select({ id: franchises.id, code: franchises.code, title: franchises.title, sourceCreatorId: creators.id, sourceCreatorName: creatorDisplayNameSql() })
            .from(creatorRelations).innerJoin(creatorSeries, eq(creatorSeries.creatorId, creatorRelations.sourceCreatorId))
            .innerJoin(franchises, eq(franchises.id, creatorSeries.seriesId))
            .innerJoin(creators, eq(creators.id, creatorRelations.sourceCreatorId))
            .where(and(eq(creatorRelations.targetCreatorId, id), eq(creatorRelations.relationType, "pseudonym_of")))
            .orderBy(asc(creatorDisplayNameSql()), asc(franchises.title), asc(franchises.id)),
        getCreatorProviderVariants([id]),
        db.select({ seriesId: creatorSeries.seriesId }).from(creatorSeries).where(eq(creatorSeries.creatorId, id)),
        db.selectDistinct({ code: creatorRoles.code, name: creatorRoles.name }).from(entryCreators)
          .innerJoin(creatorRoles, eq(creatorRoles.id, entryCreators.roleId)).where(eq(entryCreators.creatorId, id)),
    ]);
    return { ...creator, relations, incomingRelations, inheritedSeries, providerVariants: providerVariants.map(v => ({ ...v, mappingId: v.id })), seriesIds: directSeries.map(s => s.seriesId), roles };
}
export async function getEntryCreators(entryId: number): Promise<EntryCreator[]> {
    return db.select({ id: creators.id, name: creatorDisplayNameSql(), slug: creators.slug, typeCode: creatorTypes.code, roleId: creatorRoles.id, roleCode: creatorRoles.code, roleName: creatorRoles.name, isManual: entryCreators.isManual, hasProviderSource: sql<boolean>`exists (select 1 from entry_creator_sources s where s.entry_id=${entryCreators.entryId} and s.creator_id=${entryCreators.creatorId} and s.role_id=${entryCreators.roleId})` }).from(entryCreators).innerJoin(creators, eq(creators.id, entryCreators.creatorId)).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).innerJoin(creatorRoles, eq(creatorRoles.id, entryCreators.roleId)).where(eq(entryCreators.entryId, entryId)).orderBy(asc(creatorDisplayNameSql()), asc(creatorRoles.name));
}
export async function pruneEntryCreators(tx: CreatorTransaction, entryId: number) {
    await tx.delete(entryCreators).where(and(eq(entryCreators.entryId, entryId), eq(entryCreators.isManual, false), sql `not exists (select 1 from ${entryCreatorSources} s where s.entry_id=${entryCreators.entryId} and s.creator_id=${entryCreators.creatorId} and s.role_id=${entryCreators.roleId})`));
}
export async function setManualEntryCreators(entryId: number, pairs: {
    creatorId: number;
    roleId: number;
}[], transaction?: CreatorTransaction) {
    const work = async (tx: CreatorTransaction) => {
        const [entry] = await tx.select({ id: mediaItems.id }).from(mediaItems).where(eq(mediaItems.id, entryId)).for("update");
        if (!entry)
            throw new Error("Запись не найдена.");
        const unique = [...new Map(pairs.map(p => [`${p.creatorId}:${p.roleId}`, p])).values()];
        if (unique.some(p => !Number.isSafeInteger(p.creatorId) || p.creatorId <= 0 || !Number.isSafeInteger(p.roleId) || p.roleId <= 0))
            throw new Error("Некорректные связи создателей.");
        await tx.update(entryCreators).set({ isManual: false, updatedAt: new Date() }).where(eq(entryCreators.entryId, entryId));
        if (unique.length)
            await tx.insert(entryCreators).values(unique.map(p => ({ ...p, entryId, isManual: true }))).onConflictDoUpdate({ target: [entryCreators.entryId, entryCreators.creatorId, entryCreators.roleId], set: { isManual: true, updatedAt: new Date() } });
        await pruneEntryCreators(tx, entryId);
    };
    if (transaction)
        return work(transaction);
    return db.transaction(work);
}
function validValues(name: string, slug: string) {
    if (!name.trim() || !slug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
        throw new Error("Укажите имя и корректный slug.");
}
async function setSeries(tx: CreatorTransaction, id: number, seriesIds: number[]) {
    const ids = [...new Set(seriesIds)];
    if (ids.length) {
        const found = await tx.select({ id: franchises.id }).from(franchises).where(inArray(franchises.id, ids));
        if (found.length !== ids.length)
            throw new Error("Серия не найдена.");
    }
    await tx.delete(creatorSeries).where(eq(creatorSeries.creatorId, id));
    if (ids.length)
        await tx.insert(creatorSeries).values(ids.map(seriesId => ({ creatorId: id, seriesId })));
}
function validateRussianName(value: string | null | undefined) {
    if (value !== undefined && value !== null && (typeof value !== "string" || value.trim().length > 200 || /[\p{Cc}\p{Cf}]/u.test(value))) throw new Error("invalid-name");
}
type CreatorInput = {
    name: string;
    nameRu?: string | null;
    originalName?: string | null;
    birthDate?: string | null;
    deathDate?: string | null;
    slug: string;
    typeId: number;
    seriesIds?: number[];
    relations?: { targetCreatorId: number; relationType: "pseudonym_of" }[];
    adminId?: number;
};
async function validateLifeDates(tx: CreatorTransaction, input: CreatorInput, current: CreatorLifeDates = { birthDate: null, deathDate: null }, creatorId?: number) {
    const dates = {
        birthDate: input.birthDate === undefined ? current.birthDate : parseCreatorDate(input.birthDate),
        deathDate: input.deathDate === undefined ? current.deathDate : parseCreatorDate(input.deathDate),
    };
    if (dates.birthDate && dates.deathDate && dates.birthDate > dates.deathDate) throw new Error("Дата смерти не может предшествовать дате рождения.");
    if (dates.birthDate || dates.deathDate) {
        const [type] = await tx.select({ code: creatorTypes.code }).from(creatorTypes).where(eq(creatorTypes.id, input.typeId));
        const relations = input.relations ?? (creatorId ? await tx.select().from(creatorRelations).where(eq(creatorRelations.sourceCreatorId, creatorId)) : []);
        if ((type?.code !== "person" && type?.code !== "organization") || (type.code === "person" && relations.length)) throw new Error("Даты доступны для персоны без исходящей связи псевдонима или для организации.");
    }
    return dates;
}
type ReferenceInput = {
    name: string;
    code: string;
    adminId?: number;
};
async function logCreatorChange(tx: CreatorTransaction, action: string, id: number, name: string, adminId?: number) {
    if (!adminId)
        return;
    await tx.insert(adminActivityLogs).values({ action, actorType: "admin", adminUserId: adminId, entityType: "creator", entityId: id, entityLabel: name, status: "success", severity: "info", message: "Обновлены данные создателя или справочника." });
}
export async function createCreator(input: CreatorInput) {
    validValues(input.name, input.slug);
    validateRussianName(input.nameRu);
    return db.transaction(async (tx) => {
        const dates = await validateLifeDates(tx, input);
        const [type] = await tx.select({ code: creatorTypes.code }).from(creatorTypes).where(eq(creatorTypes.id, input.typeId));
        const localization = input.nameRu !== undefined ? { nameRu: input.nameRu?.trim() || null, nameRuSource: "manual" as const, nameRuProcessed: true } : type?.code === "person" ? getImportedCreatorNameLocalization({ name: input.name }) : {};
        const [row] = await tx.insert(creators).values({ name: input.name.trim(), originalName: input.originalName?.trim() || null, ...localization, ...dates, slug: input.slug, typeId: input.typeId }).returning();
        await enqueueCreatorImageFill(tx, row.id);
        await setSeries(tx, row.id, input.seriesIds ?? []);
        await setCreatorRelations(tx, row.id, input.relations);
        await logCreatorChange(tx, "creator.created", row.id, row.name, input.adminId);
        return row;
    });
}
export async function updateCreator(id: number, input: CreatorInput) {
    validValues(input.name, input.slug);
    validateRussianName(input.nameRu);
    return db.transaction(async (tx) => {
        const [current] = await tx.select().from(creators).where(eq(creators.id, id)).for("update");
        if (!current)
            throw new Error("Создатель не найден.");
        if (current.typeId !== input.typeId) {
            // Keep existing identities/participations stable; conversion requires resolving them first.
            const [dependencies] = await tx.execute<{ blocked: boolean }>(sql`select (
              exists(select 1 from provider_creator_bindings where creator_id=${id} and active)
              or exists(select 1 from provider_creator_mappings where creator_id=${id})
              or exists(select 1 from entry_creators where creator_id=${id})
              or exists(select 1 from creator_relations where source_creator_id=${id})
              or exists(select 1 from creator_relations where target_creator_id=${id})
              or exists(select 1 from entry_creator_pseudonyms where creator_id=${id})
            ) as blocked`);
            if (dependencies.blocked || (current.avatarObjectKey && current.avatarSource !== "manual")) throw new Error("creator-type-in-use");
        }
        const dates = await validateLifeDates(tx, input, current, id);
        const [type] = await tx.select({ code: creatorTypes.code }).from(creatorTypes).where(eq(creatorTypes.id, input.typeId));
        const localization = input.nameRu !== undefined ? { nameRu: input.nameRu?.trim() || null, nameRuSource: "manual" as const, nameRuProcessed: true } : type?.code === "person" ? getImportedCreatorNameLocalization({ ...current, name: input.name, nameRuProcessed: current.name !== input.name.trim() && !current.nameRu && current.nameRuSource !== "manual" && current.nameRuSource !== "provider" ? false : current.nameRuProcessed }) : {};
        const [row] = await tx.update(creators).set({ name: input.name.trim(), originalName: input.originalName === undefined ? undefined : input.originalName?.trim() || null, ...localization, ...dates, slug: input.slug, typeId: input.typeId, updatedAt: new Date() }).where(eq(creators.id, id)).returning();
        await setSeries(tx, id, input.seriesIds ?? []);
        await setCreatorRelations(tx, id, input.relations);
        await logCreatorChange(tx, "creator.updated", id, row.name, input.adminId);
        return row;
    });
}
export async function deleteCreator(id: number, adminId?: number) {
    return db.transaction(async (tx) => {
        const [binding] = await tx.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(eq(providerCreatorBindings.creatorId, id)).limit(1);
        if (binding) throw new Error("Сначала удалите подтверждённую привязку провайдера.");
        await deleteEntitySnapshotLinks(tx,{entityType:"creator",entityId:String(id)});
        const [row] = await tx.delete(creators).where(eq(creators.id, id)).returning();
        if (row)
            await logCreatorChange(tx, "creator.deleted", id, row.name, adminId);
        return row ?? null;
    });
}
function validateReference(input: ReferenceInput) {
    if (!input.name.trim() || !/^[a-z][a-z0-9_]*$/.test(input.code))
        throw new Error("Укажите имя и стабильный код.");
}
async function createReference(table: typeof creatorTypes | typeof creatorRoles, input: ReferenceInput) {
    validateReference(input);
    return db.transaction(async (tx) => {
        const [row] = await tx.insert(table).values({ name: input.name.trim(), code: input.code }).returning();
        await logCreatorChange(tx, "creator-reference.created", row.id, row.name, input.adminId);
        return row;
    });
}
async function updateReference(table: typeof creatorTypes | typeof creatorRoles, id: number, input: {
    name: string;
    code?: string;
    adminId?: number;
}) {
    return db.transaction(async (tx) => {
        const [current] = await tx.select().from(table).where(eq(table.id, id)).for("update");
        if (!current || !input.name.trim() || (input.code !== undefined && input.code !== current.code))
            throw new Error("Код справочника нельзя изменить.");
        const [row] = await tx.update(table).set({ name: input.name.trim(), updatedAt: new Date() }).where(eq(table.id, id)).returning();
        await logCreatorChange(tx, "creator-reference.updated", id, row.name, input.adminId);
        return row;
    });
}
async function deleteReference(table: typeof creatorTypes | typeof creatorRoles, id: number, adminId?: number) {
    return db.transaction(async (tx) => {
        const [current] = await tx.select().from(table).where(eq(table.id, id)).for("update");
        if (!current)
            return;
        if ((table === creatorTypes && current.code === "person") || (table === creatorRoles && current.code === "writer"))
            throw new Error("Базовый справочник используется импортом и не может быть удалён.");
        await tx.delete(table).where(eq(table.id, id));
        await logCreatorChange(tx, "creator-reference.deleted", id, current.name, adminId);
    });
}
export async function createCreatorType(input: ReferenceInput) {
    return createReference(creatorTypes, input);
}
export async function createCreatorRole(input: ReferenceInput) {
    return createReference(creatorRoles, input);
}
export async function updateCreatorType(id: number, input: {
    name: string;
    code?: string;
    adminId?: number;
}) {
    return updateReference(creatorTypes, id, input);
}
export async function updateCreatorRole(id: number, input: {
    name: string;
    code?: string;
    adminId?: number;
}) {
    return updateReference(creatorRoles, id, input);
}
export async function deleteCreatorType(id: number, adminId?: number) {
    return deleteReference(creatorTypes, id, adminId);
}
export async function deleteCreatorRole(id: number, adminId?: number) {
    return deleteReference(creatorRoles, id, adminId);
}
/** Shared archive membership covers all roles, plus the established writer pseudonym expansion. */
/** Constant creator IDs build a matching-entry set once, rather than expanding writers per record. */
export function creatorCondition(creatorId: number | SQLWrapper, entryId: SQLWrapper = sql`"media_items"."id"`, roleCode?:string):SQL {
    if(typeof creatorId !== "number") {
        return sql`(exists (select 1 from entry_creators ec where ec.entry_id=${entryId} and ec.creator_id=${creatorId})
          or ${creatorWriterCondition(creatorId,entryId)})`;
    }
    const roleId=roleCode?sql`(select id from creator_roles where code=${roleCode})`:undefined;
    const direct=sql`select ec.entry_id from entry_creators ec where ec.creator_id=${creatorId}
        ${roleId?sql`and ec.role_id=${roleId}`:sql``}`;
    if(roleCode&&roleCode!=="writer")return sql`${entryId} in (${direct})`;
    const writerRole=roleId??sql`(select id from creator_roles where code='writer')`;
    return sql`${entryId} in (
        ${direct}
        union select p.entry_id from entry_creator_pseudonyms p where p.creator_id=${creatorId} and p.role_id=${writerRole}
        union select ec.entry_id from creator_relations cr
            join entry_creators ec on ec.creator_id=cr.source_creator_id and ec.role_id=${writerRole}
            where cr.target_creator_id=${creatorId} and cr.relation_type='pseudonym_of'
        union select p.entry_id from creator_relations cr
            join entry_creator_pseudonyms p on p.creator_id=cr.source_creator_id and p.role_id=${writerRole}
            where cr.target_creator_id=${creatorId} and cr.relation_type='pseudonym_of'
    )`;
}

/** Stable Creator tabs: independent of search, roles and the current archive filters. */
export async function getCreatorMediaTypeCodes(creatorId: number, accessibleCodes: readonly string[]) {
    if (!accessibleCodes.length) return [];
    const rows = await db.selectDistinct({ code: mediaItems.mediaType }).from(mediaItems).where(and(
        eq(mediaItems.publicationStatus, "published"),
        inArray(mediaItems.mediaType, [...accessibleCodes]),
        creatorCondition(creatorId),
    ));
    return rows.map(row => row.code);
}

/** Selected pseudonyms and their directly related writers, never reverse expansion. */
export function creatorWriterCondition(creatorId: number | SQLWrapper, entryId: SQLWrapper = sql`"media_items"."id"`):SQL {
    if(typeof creatorId==="number")return creatorCondition(creatorId,entryId,"writer");
    return sql`exists (select 1 from (${entryWriterMembershipSql(entryId)}) membership
        where membership.creator_id = ${creatorId})`;
}

function assignedWritersSql(entryId: SQLWrapper) {
    return sql`select ec.creator_id from entry_creators ec join creator_roles r on r.id=ec.role_id
        where ec.entry_id=${entryId} and r.code='writer'
        union select p.creator_id from entry_creator_pseudonyms p join creator_roles r on r.id=p.role_id
        where p.entry_id=${entryId} and r.code='writer'`;
}
function entryWriterMembershipSql(entryId: SQLWrapper) {
    return sql`select assigned.creator_id from (${assignedWritersSql(entryId)}) assigned
        union select cr.target_creator_id from (${assignedWritersSql(entryId)}) assigned
        join creator_relations cr on cr.source_creator_id=assigned.creator_id and cr.relation_type='pseudonym_of'`;
}

async function setCreatorRelations(tx: CreatorTransaction, creatorId: number, relations?: { targetCreatorId: number; relationType: "pseudonym_of" }[]) {
    if (relations === undefined) return;
    if (relations.some(r => r.relationType !== "pseudonym_of" || !Number.isSafeInteger(r.targetCreatorId) || r.targetCreatorId <= 0 || r.targetCreatorId === creatorId)) {
        throw new Error("Некорректная связь создателей.");
    }
    await tx.delete(creatorRelations).where(eq(creatorRelations.sourceCreatorId, creatorId));
    const ids = [...new Set(relations.map(r => r.targetCreatorId))];
    if (ids.length) await tx.insert(creatorRelations).values(ids.map(targetCreatorId => ({ sourceCreatorId: creatorId, targetCreatorId, relationType: "pseudonym_of" as const })));
}

function completePseudonymSql(entryId: number) {
    return sql<boolean>`exists (select 1 from creator_relations cr where cr.source_creator_id=${creators.id} and cr.relation_type='pseudonym_of')
      and not exists (select 1 from creator_relations cr where cr.source_creator_id=${creators.id} and cr.relation_type='pseudonym_of'
        and not exists (select 1 from entry_creators s join creator_roles r on r.id=s.role_id
          where s.entry_id=${entryId} and s.creator_id=cr.target_creator_id and r.code='writer'))`;
}
export async function getEntryPseudonymState(entryId: number, connection: CreatorTransaction | typeof db = db) {
    const [candidates, selectedRows] = await Promise.all([
        connection.select({ id: creators.id, name: creatorDisplayNameSql() }).from(creators).where(completePseudonymSql(entryId)).orderBy(asc(creatorDisplayNameSql()), asc(creators.id)),
        connection.select({ id: creators.id, name: creatorDisplayNameSql(), isComplete: completePseudonymSql(entryId) })
            .from(entryCreatorPseudonyms).innerJoin(creators, eq(creators.id, entryCreatorPseudonyms.creatorId)).where(eq(entryCreatorPseudonyms.entryId, entryId)),
    ]);
    return { candidates, selected: selectedRows[0] ?? null };
}
export async function setEntryPseudonym(entryId: number, creatorId: number | null, adminId: number) {
    if (!Number.isSafeInteger(entryId) || entryId <= 0 || (creatorId !== null && (!Number.isSafeInteger(creatorId) || creatorId <= 0))) throw new Error("Некорректная запись или создатель.");
    return db.transaction(async tx => {
        const [entry] = await tx.select({ id: mediaItems.id }).from(mediaItems).where(eq(mediaItems.id, entryId)).for("update");
        if (!entry) throw new Error("Запись не найдена.");
        if (creatorId !== null) {
            await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, creatorId)).for("update");
            const state = await getEntryPseudonymState(entryId, tx);
            if (!state.candidates.some(c => c.id === creatorId)) throw new Error("Состав псевдонима не совпадает с авторами записи.");
            const [role] = await tx.select({ id: creatorRoles.id }).from(creatorRoles).where(eq(creatorRoles.code, "writer"));
            if (!role) throw new Error("Роль автора не найдена.");
            await tx.insert(entryCreatorPseudonyms).values({ entryId, creatorId, roleId: role.id }).onConflictDoUpdate({ target: entryCreatorPseudonyms.entryId, set: { creatorId, roleId: role.id } });
        } else {
            await tx.delete(entryCreatorPseudonyms).where(eq(entryCreatorPseudonyms.entryId, entryId));
        }
        await tx.insert(adminActivityLogs).values({ action: creatorId === null ? "entry.pseudonym-cleared" : "entry.pseudonym-applied", actorType: "admin", adminUserId: adminId,
            entityType: "media-item", entityId: entryId, status: "success", severity: "info", message: creatorId === null ? "Отменён выбор псевдонима записи." : "Выбран отображаемый псевдоним записи.", metadata: { creatorId } });
    });
}

export function entryCreatorSearchCondition(query: string, entryId: SQLWrapper = sql`"media_items"."id"`) {
    // Build the matching entry set once. Correlating the writer expansion with
    // every entry and every matching creator makes catalog search trigger JIT.
    return sql`${entryId} in (
        with matching_creators as materialized (
            select c.id from creators c where ${creatorNameSearchSql(query, { name: sql`c.name`, nameRu: sql`c.name_ru`, originalName: sql`c.original_name` })}
        ), assigned_writers as materialized (
            select ec.entry_id, ec.creator_id from entry_creators ec
            join creator_roles r on r.id=ec.role_id and r.code='writer'
            union
            select p.entry_id, p.creator_id from entry_creator_pseudonyms p
            join creator_roles r on r.id=p.role_id and r.code='writer'
        )
        select ec.entry_id from entry_creators ec
        join matching_creators c on c.id=ec.creator_id
        union
        select a.entry_id from assigned_writers a
        join matching_creators c on c.id=a.creator_id
        union
        select a.entry_id from assigned_writers a
        join creator_relations cr on cr.source_creator_id=a.creator_id and cr.relation_type='pseudonym_of'
        join matching_creators c on c.id=cr.target_creator_id
    )`;
}
