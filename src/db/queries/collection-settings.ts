import { eq } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { collectionSettings } from "@/db/schema";
import { DEFAULT_EDITORIAL_DOCUMENT_LIMITS, type EditorialDocumentLimits } from "@/lib/editorial-documents/model";
import { parseCollectionSettings } from "@/lib/editorial-documents/settings";

export async function getCollectionSettings(connection: typeof db | DbTransaction = db): Promise<EditorialDocumentLimits> {
  const [settings] = await connection.select({ maxBlocks: collectionSettings.maxBlocks, maxEntries: collectionSettings.maxEntries })
    .from(collectionSettings).where(eq(collectionSettings.id, 1)).limit(1);
  return settings ?? { ...DEFAULT_EDITORIAL_DOCUMENT_LIMITS };
}

export async function saveCollectionSettings(input: EditorialDocumentLimits & { updatedByAdminId: number }) {
  const limits = parseCollectionSettings(input);
  if (!limits) throw new Error("invalid-collection-limits");
  await db.insert(collectionSettings).values({ id: 1, ...limits, updatedByAdminId: input.updatedByAdminId })
    .onConflictDoUpdate({ target: collectionSettings.id, set: { ...limits, updatedByAdminId: input.updatedByAdminId, updatedAt: new Date() } });
}
