import { createHash } from "node:crypto";
import { checkPlatformImagesReconcileState, type PlatformImagesReconcileRow } from "@/db/queries/platform-images-reconcile";
import type { SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { AVATAR_MAX_BYTES } from "@/lib/avatars/config";
import { isPlatformLogoObjectKey, isPlatformProviderLogoObjectKey } from "@/lib/platforms/logo-url";
import { transformPlatformLogo } from "@/lib/platforms/logo-storage";
import { probeS3Object, S3UploadError, uploadS3Object } from "@/lib/services/minio";
import { fetchProviderImage, isSafeProviderImageUrl } from "./provider-image-relay";

export type PlatformLogoReconcileResult = {
  status: "healthy" | "missing" | "restored" | "skipped" | "failed" | "retry" | "fatal";
  code: string; manualMissing: boolean; importedMissing: boolean;
};
const defaults = { probe: probeS3Object, fetchImage: fetchProviderImage, transform: transformPlatformLogo, upload: uploadS3Object, checkState: checkPlatformImagesReconcileState };
export type PlatformImagesReconcileDependencies = Partial<typeof defaults>;
/** Use the approved image key, never a subsequently refreshed provider profile image. */
export function platformImageRecoverySource(row: PlatformImagesReconcileRow): { providerCode: "igdb" | "rawg"; imageUrl: string } | null {
  const { importedLogoProvider: providerCode, importedLogoImageKey: imageKey } = row.platform;
  if (!imageKey || (providerCode !== "igdb" && providerCode !== "rawg")) return null;
  const imageUrl = providerCode === "igdb" && /^[a-zA-Z0-9_-]+$/.test(imageKey) ? `https://images.igdb.com/igdb/image/upload/t_original/${imageKey}.png` : providerCode === "rawg" ? imageKey : null;
  return imageUrl && isSafeProviderImageUrl(providerCode, imageUrl) ? { providerCode, imageUrl } : null;
}
export async function processPlatformLogo(row: PlatformImagesReconcileRow, mode: "audit" | "repair", guard: SnapshotJobGuard, signal: AbortSignal, dependencies: PlatformImagesReconcileDependencies = {}): Promise<PlatformLogoReconcileResult> {
  const d = { ...defaults, ...dependencies };
  let manualMissing = false, importedMissing = false;
  const result = (status: PlatformLogoReconcileResult["status"], code: string): PlatformLogoReconcileResult => ({ status, code, manualMissing, importedMissing });
  const manual = row.platform.manualLogoObjectKey, imported = row.platform.importedLogoObjectKey;
  signal.throwIfAborted();
  const invalidManual = Boolean(manual && (!isPlatformLogoObjectKey(manual) || !manual.startsWith(`logos/platforms/${row.platform.id}/`)));
  const invalidImported = Boolean(imported && !isPlatformProviderLogoObjectKey(imported));
  for (const [kind, objectKey] of [["manual", manual], ["imported", imported]] as const) {
    if (!objectKey || (kind === "manual" ? invalidManual : invalidImported)) continue;
    const probe = await d.probe({ objectKey, signal });
    signal.throwIfAborted();
    if (probe.status === "error") return result(probe.fatal ? "fatal" : probe.retryable ? "retry" : "failed", probe.code);
    if (probe.status === "missing") { if (kind === "manual") manualMissing = true; else importedMissing = true; }
  }
  if (!manualMissing && !importedMissing) return invalidManual || invalidImported ? result("skipped", invalidManual ? "InvalidManualKey" : "InvalidImportedKey") : result(manual || imported ? "healthy" : "skipped", manual || imported ? "ObjectsPresent" : "NoObjects");
  if (mode === "audit") return result("missing", "MissingObjects");
  if (!importedMissing || !imported) return result("skipped", "ManualSourceUnavailable");
  const source = platformImageRecoverySource(row);
  const expectedHash = row.platform.importedLogoContentHash;
  if (!source || !expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash) || !imported.startsWith(`avatars/platform-providers/${source.providerCode}/${row.platform.importedLogoExternalId}/`) || !imported.endsWith(`/${expectedHash}.webp`)) return result("skipped", "NoSafeSavedSource");
  if (row.eligibleImportedObjectKey !== imported) return result("skipped", "ImportedNotApproved");
  let image: Awaited<ReturnType<typeof d.fetchImage>>;
  try { image = await d.fetchImage({ ...source, maxBytes: AVATAR_MAX_BYTES, signal }); }
  catch { signal.throwIfAborted(); return result("retry", "ImageNetwork"); }
  signal.throwIfAborted();
  if (!image.ok) return result(image.retryable ? "retry" : "failed", image.status ? `ImageHttp${image.status}` : `Image-${image.error}`);
  let body: Buffer;
  try { body = await d.transform(image.body); } catch { return result("failed", "InvalidImage"); }
  if (createHash("sha256").update(body).digest("hex") !== expectedHash) return result("skipped", "ExactImageHashMismatch");
  signal.throwIfAborted();
  if (!await d.checkState({ row, guard, signal })) return result("skipped", "SourceChanged");
  signal.throwIfAborted();
  try {
    await d.upload({ objectKey: imported, body, contentType: "image/webp", ifNoneMatch: "*", signal });
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof S3UploadError) {
      if (error.status === 412) return result("skipped", "ObjectRestoredConcurrently");
      const transient = error.status === 409 || error.status === 429 || error.status >= 500;
      return result(transient ? "retry" : "fatal", `StorageHttp${error.status}`);
    }
    return result("retry", "StorageNetwork");
  }
  signal.throwIfAborted();
  // The key already belonged to an approved immutable asset. Never delete it, even after a lost fence.
  if (!await d.checkState({ row, guard, signal })) return result("skipped", "SourceChanged");
  return result("restored", manualMissing || invalidManual ? "ImportedRestoredManualUnavailable" : "ExactImportedRestored");
}
