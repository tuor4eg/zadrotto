import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { normalizeSearchText } from "@/lib/search/normalize";

export function normalizeSearchSql(value: SQLWrapper): SQL<string> {
  return sql<string>`replace(lower(regexp_replace(btrim(coalesce(${value}, '')), '\\s+', ' ', 'g')), 'ё', 'е')`;
}

export function containsNormalizedSearchSql(value: SQLWrapper, query: string): SQL {
  return sql`${normalizeSearchSql(value)} like ${`%${normalizeSearchText(query)}%`}`;
}

export function containsNormalizedSearchWordsSql(value: SQLWrapper, query: string): SQL {
  const literal = normalizeSearchText(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sql`${normalizeSearchSql(value)} ~ ${`(^|[^[:alnum:]])${literal}($|[^[:alnum:]])`}`;
}

export function normalizedSearchIndexSql(value: SQLWrapper): SQL {
  return sql`${normalizeSearchSql(value)} gin_trgm_ops`;
}
