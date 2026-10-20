import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { creators } from "@/db/schema";

/** One bounded PK lookup for report rows, never a query per link or a full directory. */
export async function getCreatorNamesByIds(ids: readonly number[]): Promise<Record<number, string>> {
  const uniqueIds = [...new Set(ids)].filter(id => Number.isSafeInteger(id) && id > 0);
  if (!uniqueIds.length) return {};
  const rows = await db.select({ id: creators.id, name: creators.name }).from(creators).where(inArray(creators.id, uniqueIds));
  return Object.fromEntries(rows.map(row => [row.id, row.name]));
}
