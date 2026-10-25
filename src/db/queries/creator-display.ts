import { or, sql, type SQLWrapper } from "drizzle-orm";
import { creators } from "@/db/schema";
import { containsNormalizedSearchSql } from "@/db/search";

/** Display only: provider identity matching must continue to use the source name. */
export function creatorDisplayNameSql(name: SQLWrapper = creators.name, nameRu: SQLWrapper = creators.nameRu) {
  return sql<string>`coalesce(${nameRu}, ${name})`;
}

export function creatorNameSearchSql(query: string, columns: {
  name: SQLWrapper; nameRu: SQLWrapper; originalName: SQLWrapper;
} = creators) {
  return or(
    containsNormalizedSearchSql(columns.nameRu, query),
    containsNormalizedSearchSql(columns.name, query),
    containsNormalizedSearchSql(columns.originalName, query),
  )!;
}
