import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { parseFantlabSyncPayload, syncCreatorFantlabAvatar } from "../src/lib/creators/fantlab-sync";
import { JobError } from "../src/lib/jobs/types";

type Dependencies = NonNullable<Parameters<typeof syncCreatorFantlabAvatar>[3]>;
const controller = new AbortController();
const body = Buffer.from("processed-webp");
const hash = createHash("sha256").update(body).digest("hex");
function fixture() {
  const calls: string[] = [];
  const state = { id: 1, name: "Автор", slug: "author", originalName: null, typeId: 1, createdAt: new Date(), updatedAt: new Date(),
    avatarObjectKey: "old-key", avatarSource: "fantlab" as "manual" | "fantlab" | null,
    avatarSourceExternalId: "20", avatarSourceUrl: null, avatarOriginalUrl: null, avatarFetchedAt: null, avatarContentHash: null as string | null, avatarVersion: 4 };
  const dependencies: Dependencies = {
    getCreatorAvatarState: async () => state,
    getCreatorFantlabBindings: async () => [{ id: 2, provider: "fantlab", externalCreatorId: "20", creatorId: 1, createdAt: new Date(), updatedAt: new Date() }],
    getCreatorFantlabMappings: async () => [],
    getFantlabAuthor: async id => { calls.push(`author:${id}`); return { id, name: "Автор", originalName: null, imageUrl: "https://fantlab.ru/main", previewUrl: "https://fantlab.ru/preview", sourceUrl: "https://fantlab.ru/autor20" }; },
    fetchProviderImage: async input => { calls.push(input.imageUrl); return { ok: true, body: Buffer.from("raw"), contentType: "image/jpeg" }; },
    transformCreatorAvatarBuffer: async () => body,
    uploadProcessedCreatorAvatarBuffer: async () => { calls.push("upload"); return { objectKey: "new-key", contentHash: hash }; },
    commitFantlabAvatar: async () => { calls.push("commit"); return { committed: true, previousObjectKey: "old-key" }; },
    deleteCreatorAvatarBestEffort: async key => { calls.push(`delete:${key}`); },
  };
  return { state, calls, dependencies };
}
test("manual priority skips provider and storage entirely", async () => {
  const f = fixture(); f.state.avatarSource = "manual";
  assert.equal((await syncCreatorFantlabAvatar(1, false, controller.signal, f.dependencies)).status, "manual");
  assert.deepEqual(f.calls, []);
});
test("no photo and unchanged bytes preserve current local image without uploading", async () => {
  const f = fixture();
  f.dependencies.getFantlabAuthor = async id => ({ id, name: "Автор", originalName: null, imageUrl: null, previewUrl: null, sourceUrl: "https://fantlab.ru/autor20" });
  assert.equal((await syncCreatorFantlabAvatar(1, false, controller.signal, f.dependencies)).status, "no-image");
  assert.deepEqual(f.calls, []);
  const same = fixture(); same.state.avatarContentHash = hash;
  assert.equal((await syncCreatorFantlabAvatar(1, false, controller.signal, same.dependencies)).status, "unchanged");
  assert.equal(same.calls.includes("upload"), false);
});
test("preview is tried when full photo fails, old object is removed after commit", async () => {
  const f = fixture();
  f.dependencies.fetchProviderImage = async input => {
    f.calls.push(input.imageUrl);
    return input.imageUrl.endsWith("main") ? { ok: false, error: "unavailable" } : { ok: true, body, contentType: "image/jpeg" };
  };
  assert.equal((await syncCreatorFantlabAvatar(1, false, controller.signal, f.dependencies)).status, "updated");
  assert.deepEqual(f.calls, ["author:20", "https://fantlab.ru/main", "https://fantlab.ru/preview", "upload", "commit", "delete:old-key"]);
});
test("concurrent manual change discards new file and preserves old one", async () => {
  const f = fixture(); f.dependencies.commitFantlabAvatar = async () => ({ committed: false });
  assert.equal((await syncCreatorFantlabAvatar(1, false, controller.signal, f.dependencies)).status, "conflict");
  assert.equal(f.calls.includes("delete:new-key"), true);
  assert.equal(f.calls.includes("delete:old-key"), false);
});
test("lost worker lease rejects the avatar commit, cleans its upload and never retries the preview", async () => {
  const f = fixture();
  const jobGuard = { runId: 21, lockToken: "former-owner" };
  const lost = new JobError("lease-lost", "Worker lease expired", { retryable: false });
  f.dependencies.commitFantlabAvatar = async input => {
    assert.deepEqual(input.jobGuard, jobGuard);
    f.calls.push("commit");
    throw lost;
  };
  await assert.rejects(syncCreatorFantlabAvatar(1, false, controller.signal, f.dependencies, jobGuard), error => error === lost);
  assert.deepEqual(f.calls, ["author:20", "https://fantlab.ru/main", "upload", "commit", "delete:new-key"]);
});
test("dry run fetches and validates but never writes; missing binding prevents all requests", async () => {
  const f = fixture();
  assert.equal((await syncCreatorFantlabAvatar(1, true, controller.signal, f.dependencies)).status, "would-update");
  assert.equal(f.calls.includes("upload"), false);
  f.calls.length = 0; f.dependencies.getCreatorFantlabBindings = async () => [];
  assert.equal((await syncCreatorFantlabAvatar(1, false, controller.signal, f.dependencies)).status, "unresolved");
  assert.deepEqual(f.calls, []);
});
test("job payload accepts resume and dry run but rejects unsafe or unknown values", () => {
  assert.deepEqual(parseFantlabSyncPayload({}), { dryRun: false, afterId: 0, limit: 50 });
  assert.deepEqual(parseFantlabSyncPayload({ dryRun: true, creatorId: 4, afterId: 3, limit: 2 }), { dryRun: true, creatorId: 4, afterId: 3, limit: 2 });
  for (const input of [null, [], { dryRun: "false" }, { creatorId: -1 }, { afterId: -1 }, { limit: 201 }, { unexpected: true }]) assert.throws(() => parseFantlabSyncPayload(input));
});
