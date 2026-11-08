import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { creatorTypes, creators, providerCreatorBindings, providerCreatorMappings } from "@/db/schema";
import { normalizeSearchSql } from "@/db/search";
import { creatorAutoApprovalNameParts, escapeCreatorNameLike, escapeCreatorNameRegex } from "@/lib/creators/auto-approval-name";
import type { CreatorTransaction } from "./creators";

export async function getCreatorAutoApprovalCandidates(tx: CreatorTransaction, name: string, options: { exactOrganization?: boolean; organization?: boolean } = {}): Promise<{ id: number; name: string }[]> {
    const { exactOrganization = false, organization = false } = options;
    const { normalized, words } = creatorAutoApprovalNameParts(name, organization || exactOrganization);
    if (!normalized) return [];

    const sources = [
        { table: creators, id: creators.id, name: creators.name },
        { table: creators, id: creators.id, name: creators.nameRu },
        { table: creators, id: creators.id, name: creators.originalName },
        { table: providerCreatorMappings, id: providerCreatorMappings.creatorId, name: providerCreatorMappings.externalCreatorName },
        { table: providerCreatorBindings, id: providerCreatorBindings.creatorId, name: providerCreatorBindings.externalCreatorName, active: true },
    ];
    const branches = (predicate: (column: SQLWrapper) => SQL, word: string | null) => sources.map(source => sql`
        select ${source.id} as creator_id, ${word}::text as word from ${source.table}
        where ${predicate(source.name)} ${source.active ? sql`and ${providerCreatorBindings.active}` : sql``}
    `);
    const fullHits = sql.join(branches(column => exactOrganization
        ? sql`${normalizeSearchSql(column)} = ${normalized}`
        : sql`${normalizeSearchSql(column)} like ${`%${escapeCreatorNameLike(normalized)}%`}
            ${organization ? sql`and ${normalizeSearchSql(column)} ~ ${`(^|[^[:alnum:]_])${escapeCreatorNameRegex(normalized)}($|[^[:alnum:]_])`}` : sql``}`, null), sql` union all `);
    const tokenHits = !exactOrganization && words.length >= 2 ? sql.join(words.flatMap(word => branches(
        column => sql`${normalizeSearchSql(column)} ~ ${String.raw`\m${escapeCreatorNameRegex(word)}\M`}`, word,
    )), sql` union all `) : null;
    // Each branch keeps its normalized expression indexable. Fuzzy duplicate detection
    // excludes the opposite person/organization type before limiting diagnostics.
    // Collectives still require review; exact organization matching needs a unique owner.
    const rows = await tx.execute<{ id: number; name: string }>(sql`
        select c.id, c.name from creators c join (
            select distinct creator_id from (${fullHits}) full_hits
            ${tokenHits ? sql`union select creator_id from (${tokenHits}) token_hits group by creator_id having count(distinct word) >= 2` : sql``}
        ) candidates on candidates.creator_id = c.id
        join ${creatorTypes} on ${creatorTypes.id} = c.type_id
        where ${exactOrganization
            ? sql`${creatorTypes.code} = 'organization'`
            : sql`${creatorTypes.code} <> ${organization ? "person" : "organization"}` }
        limit ${sql.raw(exactOrganization ? "2" : "10")}
    `);
    return Array.from(rows);
}
