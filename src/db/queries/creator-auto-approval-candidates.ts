import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { creators, providerCreatorBindings, providerCreatorMappings } from "@/db/schema";
import { normalizeSearchSql } from "@/db/search";
import { creatorAutoApprovalNameParts, escapeCreatorNameLike, escapeCreatorNameRegex } from "@/lib/creators/auto-approval-name";
import type { CreatorTransaction } from "./creators";

export async function getCreatorAutoApprovalCandidates(tx: CreatorTransaction, name: string): Promise<{ id: number; name: string }[]> {
    const { normalized, words } = creatorAutoApprovalNameParts(name);
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
    const fullHits = sql.join(branches(column => sql`${normalizeSearchSql(column)} like ${`%${escapeCreatorNameLike(normalized)}%`}`, null), sql` union all `);
    const tokenHits = words.length >= 2 ? sql.join(words.flatMap(word => branches(
        column => sql`${normalizeSearchSql(column)} ~ ${String.raw`\m${escapeCreatorNameRegex(word)}\M`}`, word,
    )), sql` union all `) : null;
    // Each branch keeps its normalized expression indexable. No provider/type restriction:
    // a probable duplicate anywhere must prevent automatic creation.
    const rows = await tx.execute<{ id: number; name: string }>(sql`
        select c.id, c.name from creators c join (
            select distinct creator_id from (${fullHits}) full_hits
            ${tokenHits ? sql`union select creator_id from (${tokenHits}) token_hits group by creator_id having count(distinct word) >= 2` : sql``}
        ) candidates on candidates.creator_id = c.id
        limit 10
    `);
    return Array.from(rows);
}
