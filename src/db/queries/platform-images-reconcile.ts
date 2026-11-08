import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { platforms, platformProviderProfiles } from "@/db/schema";
import { eligibleImportedPlatformLogoSql } from "./platform-logos";
import { withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";

export async function platformImagesReconcileUpperId(platformId?: number) {
  const [row] = await db.select({ id: platforms.id }).from(platforms).where(platformId ? eq(platforms.id, platformId) : undefined).orderBy(desc(platforms.id)).limit(1);
  return row?.id ?? 0;
}
export function platformImagesReconcileBatch(input: { afterId: number; throughId: number; batchSize: number; platformId?: number }) {
  return db.select({ platform: platforms, profile: platformProviderProfiles, eligibleImportedObjectKey: eligibleImportedPlatformLogoSql() }).from(platforms)
    .leftJoin(platformProviderProfiles, and(eq(platformProviderProfiles.provider, platforms.importedLogoProvider), eq(platformProviderProfiles.externalId, platforms.importedLogoExternalId)))
    .where(and(gt(platforms.id, input.afterId), lte(platforms.id, input.throughId), input.platformId ? eq(platforms.id, input.platformId) : undefined)).orderBy(asc(platforms.id)).limit(input.batchSize + 1);
}
export type PlatformImagesReconcileRow = Awaited<ReturnType<typeof platformImagesReconcileBatch>>[number];
const fields = ["logoVersion", "logoMode", "manualLogoObjectKey", "manualLogoContentHash", "importedLogoObjectKey", "importedLogoContentHash", "importedLogoProvider", "importedLogoExternalId", "importedLogoImageKey"] as const;
export function platformImageReconcileStateMatches(current: PlatformImagesReconcileRow["platform"], expected: PlatformImagesReconcileRow["platform"]) {
  return fields.every(k => current[k] === expected[k]);
}
/** Fence exact-byte recovery against manual/source changes; never alter asset or approval metadata. */
export async function checkPlatformImagesReconcileState(input: { row: PlatformImagesReconcileRow; guard: SnapshotJobGuard; signal: AbortSignal }) {
  return withSnapshotJobGuard(input.guard, async tx => {
    const [row] = await tx.select({ platform: platforms, eligibleImportedObjectKey: eligibleImportedPlatformLogoSql() }).from(platforms).where(eq(platforms.id, input.row.platform.id)).for("update");
    input.signal.throwIfAborted();
    if (!row || !platformImageReconcileStateMatches(row.platform, input.row.platform) || row.eligibleImportedObjectKey !== input.row.eligibleImportedObjectKey) return false;
    return true;
  });
}
