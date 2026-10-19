import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { platforms } from "@/db/schema";
import { isPlatformLogoObjectKey } from "@/lib/platforms/logo-url";

/** Explicit outer aliases prevent Drizzle stripping qualification in single-table projections. */
export function eligibleImportedPlatformLogoSql() {
  return sql<string | null>`case when exists (
    select 1 from provider_platform_mappings ppm
    where ppm.platform_id="platforms"."id" and ppm.provider="platforms"."imported_logo_provider"
      and ppm.external_platform_id="platforms"."imported_logo_external_id"
  ) and exists (
    select 1 from platform_requests pr where pr.kind='logo' and pr.decision='map'
      and pr.apply_status='processed' and pr.target_platform_id="platforms"."id"
      and pr.proposal->>'provider'="platforms"."imported_logo_provider" and pr.proposal->>'externalId'="platforms"."imported_logo_external_id"
      and pr.proposal->>'imageKey'="platforms"."imported_logo_image_key"
      and pr.proposal->>'objectKey'="platforms"."imported_logo_object_key"
  ) then "platforms"."imported_logo_object_key" else null end`;
}

export async function getPlatformLogoState(id: number) {
  return (await db.select().from(platforms).where(eq(platforms.id, id)).limit(1))[0] ?? null;
}

export async function setManualPlatformLogo(input: { platformId: number; expectedVersion: number; objectKey: string; contentHash: string }) {
  if (!isPlatformLogoObjectKey(input.objectKey) || !input.objectKey.startsWith(`logos/platforms/${input.platformId}/`) || !/^[a-f0-9]{64}$/.test(input.contentHash)) throw new Error("Некорректный логотип.");
  return db.transaction(async tx => {
    const [row] = await tx.select().from(platforms).where(eq(platforms.id, input.platformId)).for("update");
    if (!row || row.logoVersion !== input.expectedVersion) throw new Error("Платформа изменилась. Обновите страницу.");
    await tx.update(platforms).set({ manualLogoObjectKey: input.objectKey, manualLogoContentHash: input.contentHash, logoVersion: row.logoVersion + 1, updatedAt: new Date() }).where(eq(platforms.id, row.id));
    return row.manualLogoObjectKey;
  });
}

export async function clearManualPlatformLogo(input: { platformId: number; expectedVersion: number }) {
  const [row] = await db.update(platforms).set({ manualLogoObjectKey: null, manualLogoContentHash: null, logoVersion: sql`${platforms.logoVersion}+1`, updatedAt: new Date() })
    .where(and(eq(platforms.id, input.platformId), eq(platforms.logoVersion, input.expectedVersion))).returning({ id: platforms.id });
  if (!row) throw new Error("Платформа изменилась. Обновите страницу.");
}

export async function setPlatformLogoMode(input: { platformId: number; expectedVersion: number; mode: "exact" | "combined" }) {
  const [row] = await db.update(platforms).set({ logoMode: input.mode, logoVersion: sql`${platforms.logoVersion}+1`, updatedAt: new Date() })
    .where(and(eq(platforms.id, input.platformId), eq(platforms.logoVersion, input.expectedVersion))).returning({ id: platforms.id });
  if (!row) throw new Error("Платформа изменилась. Обновите страницу.");
}

export async function isAssignedPlatformLogoObjectKey(key: string) {
  return Boolean((await db.select({ id: platforms.id }).from(platforms).where(or(eq(platforms.manualLogoObjectKey, key), and(eq(platforms.importedLogoObjectKey, key), eq(eligibleImportedPlatformLogoSql(), key), sql`${platforms.manualLogoObjectKey} is null`))).limit(1))[0]);
}

export async function isCachedPlatformProviderLogoObjectKey(key: string) {
  const result = await db.execute<{ found: boolean }>(sql`select exists(select 1 from platform_provider_profiles where image_object_key=${key}) as found`);
  return result[0]?.found === true;
}
