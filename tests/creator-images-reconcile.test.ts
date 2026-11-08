import './fixtures/server-runtime';
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCreatorImagesReconcilePayload } from "@/lib/covers/creator-images-reconcile-model";
import { creatorImageReconcileStateMatches, type CreatorImagesReconcileRow } from "@/db/queries/creator-images-reconcile";
import { creatorImageReconcileSource, runCreatorImagesReconcile, type CreatorImagesReconcileDependencies } from "@/lib/covers/creator-images-reconcile-job";
import type { CreatorImagesReconcilePayload } from "@/lib/covers/creator-images-reconcile-model";

const key = "avatars/creators/1/11111111-1111-4111-8111-111111111111.webp";
const row = { typeCode: "person", creator: { id: 1, typeId: 1, avatarVersion: 2, avatarObjectKey: key, avatarSource: "tmdb", avatarSourceExternalId: "person:123", avatarSourceUrl: "https://www.themoviedb.org/person/123", avatarOriginalUrl: "https://image.tmdb.org/a.png", avatarContentHash: "old", avatarFetchedAt: new Date("2026-01-01") } } as CreatorImagesReconcileRow;
function fixture(extra: CreatorImagesReconcileDependencies = {}) {
  const saved: CreatorImagesReconcilePayload[] = []; let uploads = 0; let commits = 0;
  const dependencies: CreatorImagesReconcileDependencies = {
    platformUpperId: async () => 0, platformBatch: async () => [],
    log: async () => {}, referenced: async () => false, remove: async () => {},
    upperId: async () => 1, batch: async () => [row], save: async (_guard, p) => { saved.push(structuredClone(p)); },
    probe: async () => ({ status: "missing" }), fetchImage: async () => ({ ok: true, body: Buffer.from("image"), contentType: "image/png" }),
    portrait: async b => b, logo: async b => b, upload: async input => { uploads++; assert.notEqual(input.objectKey, key); },
    commit: async input => { commits++; saved.push(structuredClone(input.payload)); assert.equal(input.row.creator.avatarSourceExternalId, "person:123"); return true; }, ...extra,
  };
  return { dependencies, saved, get uploads() { return uploads; }, get commits() { return commits; } };
}
const guard = { runId: 1, lockToken: "test" };
const signal = new AbortController().signal;
test("creator audit defaults and strict payload bounds", () => {
  assert.deepEqual(parseCreatorImagesReconcilePayload({}), { mode: "audit", batchSize: 25, scope: "all" });
  for (const p of [{ batchSize: 101 }, { creatorId: -1 }, { mode: "force" }, { includeEmpty: true }]) assert.throws(() => parseCreatorImagesReconcilePayload(p));
});
test("audit probes only and repair commits unique object with unchanged source", async () => {
  const audit = fixture(); await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({}), guard, signal, audit.dependencies);
  assert.equal(audit.uploads, 0); assert.equal(audit.saved.at(-1)?.checkpoint?.counters.missing, 1);
  const repair = fixture(); await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({ mode: "repair" }), guard, signal, repair.dependencies);
  assert.equal(repair.uploads, 1); assert.equal(repair.commits, 1); assert.equal(repair.saved.at(-1)?.checkpoint?.counters.restored, 1);
});
test("manual and unsafe saved sources skip without discovery", async () => {
  assert.equal(creatorImageReconcileSource({ ...row, creator: { ...row.creator, avatarSource: "manual" } }), null);
  const manual = { ...row, creator: { ...row.creator, avatarSource: "manual" as const, avatarOriginalUrl: null } };
  const f = fixture({ batch: async () => [manual] });
  await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({ mode: "repair" }), guard, signal, f.dependencies);
  assert.equal(f.uploads, 0); assert.equal(f.saved.at(-1)?.checkpoint?.counters.skipped, 1);
  assert.equal(creatorImageReconcileSource({ ...row, creator: { ...row.creator, avatarOriginalUrl: "https://evil.invalid/image.png" } }), null);
});
test("CAS rejects every changed source field and stale avatar version", () => {
  assert.equal(creatorImageReconcileStateMatches(row.creator, { ...row.creator, avatarFetchedAt: new Date("2026-01-01") }), true);
  for (const key of ["typeId", "avatarVersion", "avatarObjectKey", "avatarSource", "avatarSourceExternalId", "avatarSourceUrl", "avatarOriginalUrl", "avatarContentHash", "avatarFetchedAt"] as const) {
    assert.equal(creatorImageReconcileStateMatches({ ...row.creator, [key]: null } as typeof row.creator, row.creator), false, key);
  }
});
test("transient failures defer a bounded number of times without advancing cursor", async () => {
  let payload = parseCreatorImagesReconcilePayload({ mode: "repair" });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const f = fixture({ probe: async () => ({ status: "error", code: "Http503", retryable: true, fatal: false }) });
    await assert.rejects(runCreatorImagesReconcile(payload, guard, signal, f.dependencies));
    payload = f.saved.at(-1)!;
    assert.equal(payload.checkpoint?.afterId, attempt < 3 ? 0 : 1);
    assert.equal(f.uploads, 0);
  }
  assert.equal(payload.checkpoint?.counters.failed, 1);
});
test("fatal storage error stops immediately and lost CAS keeps replacement unpublished", async () => {
  const fatal = fixture({ probe: async () => ({ status: "error", code: "AccessDenied", retryable: false, fatal: true }) });
  await assert.rejects(runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({ mode: "repair" }), guard, signal, fatal.dependencies), { code: "creator-images-storage-fatal" });
  assert.equal(fatal.saved.at(-1)?.checkpoint?.afterId, 0);
  const stale = fixture({ commit: async () => false });
  await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({ mode: "repair" }), guard, signal, stale.dependencies);
  assert.equal(stale.saved.at(-1)?.checkpoint?.counters.restored, 0);
  assert.equal(stale.saved.at(-1)?.checkpoint?.counters.skipped, 1);
});

test("cancellation after upload removes only own unreferenced object", async () => {
  const controller = new AbortController(); let removed = "";
  const f = fixture({ upload: async () => { controller.abort(); }, remove: async input => { removed = input.objectKey; } });
  await assert.rejects(runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({ mode: "repair" }), guard, controller.signal, f.dependencies));
  assert.match(removed, /^avatars\/creators\/1\//); assert.notEqual(removed, key); assert.equal(f.commits, 0);
});
test("stale/manual CAS cleans unused upload, ambiguous or lease-lost publication fails closed", async () => {
  let removed = 0;
  const stale = fixture({ commit: async () => false, remove: async () => { removed++; } });
  await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({ mode: "repair" }), guard, signal, stale.dependencies);
  assert.equal(removed, 1);
  for (const referenced of [async () => true, async (): Promise<boolean> => { throw new Error("database unavailable"); }]) {
    const lost = fixture({ commit: async () => { throw new Error("lease-lost"); }, referenced, remove: async () => { removed++; } });
    await assert.rejects(runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({ mode: "repair" }), guard, signal, lost.dependencies));
  }
  assert.equal(removed, 1);
});
test("concurrent restoration of old object prevents publication and discards candidate", async () => {
  let probes = 0, removed = 0;
  const f = fixture({ probe: async () => ({ status: ++probes === 1 ? "missing" : "exists" }), remove: async () => { removed++; } });
  await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({ mode: "repair" }), guard, signal, f.dependencies);
  assert.equal(f.commits, 0); assert.equal(removed, 1); assert.equal(f.saved.at(-1)?.checkpoint?.counters.restored, 0);
});
test("operational report records missing, restored and completion with run id", async () => {
  const events: { metadata?: Record<string, unknown> | null }[] = [];
  const f = fixture({ log: async input => { events.push(input); } });
  await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({ mode: "repair" }), guard, signal, f.dependencies);
  assert.deepEqual(events.map(e => e.metadata?.outcome), ["missing", "restored", "completed"]);
  assert.equal(events.every(e => e.metadata?.runId === 1), true);
});
