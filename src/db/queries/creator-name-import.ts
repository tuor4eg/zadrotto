import { eq } from "drizzle-orm";
import { creators } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { getImportedCreatorNameLocalization, hasPredominantlyCyrillicName } from "@/lib/creators/name-localization";

export { getImportedCreatorNameLocalization };

/** Lock and re-read so a concurrent manual edit always wins over provider enrichment. */
export async function applyProviderCreatorName(tx: DbTransaction, creatorId: number, providerNameRu: string | null) {
  if (!providerNameRu || providerNameRu.trim().length > 200 || /[\p{Cc}\p{Cf}]/u.test(providerNameRu) || !hasPredominantlyCyrillicName(providerNameRu)) return;
  const [current] = await tx.select({ name: creators.name, nameRu: creators.nameRu,
    nameRuSource: creators.nameRuSource, nameRuProcessed: creators.nameRuProcessed,
  }).from(creators).where(eq(creators.id, creatorId)).for("update");
  if (!current) return;
  const next = getImportedCreatorNameLocalization({ ...current, providerNameRu });
  if (next.nameRu === current.nameRu && next.nameRuSource === current.nameRuSource && next.nameRuProcessed === current.nameRuProcessed) return;
  await tx.update(creators).set({ ...next, updatedAt: new Date() }).where(eq(creators.id, creatorId));
}
