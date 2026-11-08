import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { processPlatformLogo, platformImageRecoverySource, type PlatformImagesReconcileDependencies } from "@/lib/covers/platform-images-reconcile";
import { platformImageReconcileStateMatches, type PlatformImagesReconcileRow } from "@/db/queries/platform-images-reconcile";
import { S3UploadError, uploadS3Object } from "@/lib/services/minio";
const body = Buffer.from("exact processed image");
const hash = createHash("sha256").update(body).digest("hex");
const key = `avatars/platform-providers/igdb/123/${hash}.webp`;
const row = { platform: { id: 1, logoVersion: 2, logoMode: "combined", manualLogoObjectKey: null, manualLogoContentHash: null, importedLogoObjectKey: key, importedLogoContentHash: hash, importedLogoProvider: "igdb", importedLogoExternalId: "123", importedLogoImageKey: "old_image" }, profile: { imageId: "new_image", imageUrl: "https://images.igdb.com/new.png" }, eligibleImportedObjectKey: key } as PlatformImagesReconcileRow;
const guard = { runId: 1, lockToken: "test" }, signal = new AbortController().signal;
function fixture(extra: PlatformImagesReconcileDependencies = {}) {
  let uploads = 0, checks = 0;
  const deps: PlatformImagesReconcileDependencies = { probe: async () => ({ status: "missing" }), fetchImage: async input => { assert.match(input.imageUrl, /old_image/); return { ok: true, body, contentType: "image/png" }; }, transform: async b => b,
    upload: async input => { uploads++; assert.equal(input.objectKey, key); assert.equal(input.ifNoneMatch, "*"); }, checkState: async () => { checks++; return true; }, ...extra };
  return { deps, get uploads() { return uploads; }, get checks() { return checks; } };
}
test("audit probes manual and imported independently without writes", async () => {
  const f = fixture(); const manual = `logos/platforms/1/11111111-1111-4111-8111-111111111111.webp`;
  const result = await processPlatformLogo({ ...row, platform: { ...row.platform, manualLogoObjectKey: manual } }, "audit", guard, signal, f.deps);
  assert.equal(result.status, "missing"); assert.equal(result.manualMissing, true); assert.equal(result.importedMissing, true); assert.equal(f.uploads, 0);
});
test("repair uses saved approved image despite changed provider profile and writes exact old key conditionally", async () => {
  const f = fixture(); const before = structuredClone(row);
  assert.equal((await processPlatformLogo(row, "repair", guard, signal, f.deps)).status, "restored");
  assert.equal(f.uploads, 1); assert.equal(f.checks, 2); assert.deepEqual(row, before);
});
test("changed bytes, unapproved imports and manual-only files are not reconstructed", async () => {
  const mismatch = fixture({ transform: async () => Buffer.from("different") });
  assert.equal((await processPlatformLogo(row, "repair", guard, signal, mismatch.deps)).code, "ExactImageHashMismatch"); assert.equal(mismatch.uploads, 0);
  const unapproved = fixture(); assert.equal((await processPlatformLogo({ ...row, eligibleImportedObjectKey: null }, "repair", guard, signal, unapproved.deps)).code, "ImportedNotApproved");
  assert.equal(platformImageRecoverySource({ ...row, platform: { ...row.platform, importedLogoProvider: "rawg", importedLogoImageKey: "https://evil.invalid/a.png" } }), null);
  const manual = fixture(); assert.equal((await processPlatformLogo({ ...row, platform: { ...row.platform, manualLogoObjectKey: "logos/platforms/1/11111111-1111-4111-8111-111111111111.webp", importedLogoObjectKey: null } }, "repair", guard, signal, manual.deps)).code, "ManualSourceUnavailable");
});
test("concurrent write 412 preserves existing object and source state conflicts stop publication", async () => {
  const conflict = fixture({ upload: async () => { throw new S3UploadError(412); } });
  assert.equal((await processPlatformLogo(row, "repair", guard, signal, conflict.deps)).code, "ObjectRestoredConcurrently");
  const stale = fixture({ checkState: async () => false }); assert.equal((await processPlatformLogo(row, "repair", guard, signal, stale.deps)).code, "SourceChanged"); assert.equal(stale.uploads, 0);
  let checks = 0; const late = fixture({ checkState: async () => ++checks === 1 });
  assert.equal((await processPlatformLogo(row, "repair", guard, signal, late.deps)).code, "SourceChanged"); assert.equal(late.uploads, 1);
});
test("platform CAS rejects changed chosen asset, manual override, mode and logo version", () => {
  for (const field of ["logoVersion", "logoMode", "manualLogoObjectKey", "manualLogoContentHash", "importedLogoObjectKey", "importedLogoContentHash", "importedLogoProvider", "importedLogoExternalId", "importedLogoImageKey"] as const) {
    assert.equal(platformImageReconcileStateMatches({ ...row.platform, [field]: "changed" } as typeof row.platform, row.platform), false, field);
  }
});
test("cancellation after conditional upload propagates without deleting approved immutable key", async () => {
  const controller = new AbortController(); const f = fixture({ upload: async () => { controller.abort(); } });
  await assert.rejects(processPlatformLogo(row, "repair", guard, controller.signal, f.deps));
});
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test("S3 conditional PUT signs If-None-Match and reports 412", async () => {
  globalThis.fetch = async (_url, init) => {
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["If-None-Match"], "*"); assert.match(headers.Authorization, /SignedHeaders=content-type;host;if-none-match;x-amz-content-sha256;x-amz-date/);
    return new Response(null, { status: 412 });
  };
  await assert.rejects(uploadS3Object({ objectKey: key, body, contentType: "image/webp", ifNoneMatch: "*", env: { S3_ENDPOINT: "https://storage.invalid", S3_BUCKET: "test", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_FORCE_PATH_STYLE: "true" } }), error => error instanceof S3UploadError && error.status === 412);
});
test("unsupported manual key does not block valid imported restoration and imported invalid key does not hide manual absence", async () => {
  const f = fixture();
  const repaired = await processPlatformLogo({ ...row, platform: { ...row.platform, manualLogoObjectKey: "unsupported/manual" } }, "repair", guard, signal, f.deps);
  assert.equal(repaired.status, "restored"); assert.equal(f.uploads, 1);
  const observed = fixture();
  const audit = await processPlatformLogo({ ...row, platform: { ...row.platform, manualLogoObjectKey: "logos/platforms/1/11111111-1111-4111-8111-111111111111.webp", importedLogoObjectKey: "invalid/imported" } }, "audit", guard, signal, observed.deps);
  assert.equal(audit.manualMissing, true); assert.equal(audit.status, "missing");
});
test("conditional conflict 409 and throwing image network calls are retryable", async () => {
  const conflict = fixture({ upload: async () => { throw new S3UploadError(409); } });
  assert.equal((await processPlatformLogo(row, "repair", guard, signal, conflict.deps)).status, "retry");
  const network = fixture({ fetchImage: async () => { throw new Error("network"); } });
  assert.equal((await processPlatformLogo(row, "repair", guard, signal, network.deps)).status, "retry");
});
