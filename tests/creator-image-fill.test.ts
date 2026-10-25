import assert from "node:assert/strict";
import { test } from "node:test";
import { canWriteCreatorImage, creatorImageCandidates, parseCreatorImageRefreshPayload, parseCreatorImageFillPayload, parseCreatorImagesPayload } from "../src/lib/creators/image-policy";
import type { CreatorImageDependencies } from "../src/lib/creators/image-fill";
// Match the standalone worker server-only shim; no database dependency is invoked.
const serviceTest = process.env.NODE_PATH ? test : test.skip;
const fillCreatorImage: typeof import("../src/lib/creators/image-fill").fillCreatorImage = async (...args) => (await import("../src/lib/creators/image-fill")).fillCreatorImage(...args);
import type { JSONValue } from "../src/lib/providers/types";

const personBindings = [{ id: 2, provider: "tmdb", externalCreatorId: "person:7" }, { id: 1, provider: "fantlab", externalCreatorId: "8" }];
type State = Awaited<ReturnType<NonNullable<CreatorImageDependencies["state"]>>>;
type Snapshot = Awaited<ReturnType<NonNullable<CreatorImageDependencies["fetchProfile"]>>>;
function fixture() {
  const calls: string[] = [];
  const commits: Parameters<NonNullable<CreatorImageDependencies["commit"]>>[0][] = [];
  let state = [{ typeCode: "person", creator: { avatarObjectKey: null, avatarSource: null, avatarVersion: 2 } }] as State;
  let bindings = personBindings;
  const profiles: Record<string, JSONValue> = {
    fantlab: { autor_id: 8, type: "autor", is_opened: true, name: "Автор", image: "/images/autor/8.jpg" },
    tmdb: { id: 7, profile_path: "/person7.jpg", logo_path: "/company7.png" },
  };
  const deps: CreatorImageDependencies = {
    state: async () => state,
    bindings: async () => bindings as Awaited<ReturnType<NonNullable<CreatorImageDependencies["bindings"]>>>,
    fetchProfile: async target => { calls.push(`profile:${target.provider}`); return { id: 10, payloadHash: "hash", payload: profiles[target.provider] } as Snapshot; },
    attach: async () => { calls.push("attach"); },
    fetchImage: async input => { calls.push(`image:${input.providerCode}`); return { ok: true, body: Buffer.from("raw"), contentType: "image/jpeg" }; },
    portrait: async () => { calls.push("portrait"); return Buffer.from("portrait"); },
    logo: async () => { calls.push("logo"); return Buffer.from("logo"); },
    upload: async () => { calls.push("upload"); return { objectKey: "creators/1/new.webp" }; },
    commit: async input => { calls.push("commit"); commits.push(input); return true; },
    cleanup: async key => { calls.push(`cleanup:${key}`); },
  };
  return { calls, commits, deps, profiles, setState: (next: State) => { state = next; }, getState: () => state, setBindings: (next: typeof bindings) => { bindings = next; } };
}
const signal = () => new AbortController().signal;

test("image policy separates namespaces and deterministically prioritizes sources", () => {
  const people = creatorImageCandidates("person", [...personBindings, { id: 3, provider: "tmdb", externalCreatorId: "company:7" }]);
  assert.deepEqual(people.map(c => [c.kind.provider, c.target?.externalId]), [["fantlab", "8"], ["tmdb", "7"]]);
  const organizations = creatorImageCandidates("organization", [...personBindings, { id: 3, provider: "tmdb", externalCreatorId: "company:7" }, { id: 4, provider: "igdb", externalCreatorId: "company:9" }, { id: 5, provider: "tmdb", externalCreatorId: "network:7" }, { id: 6, provider: "tmdb", externalCreatorId: "network:x" }]);
  assert.deepEqual(organizations.map(c => [c.kind.provider, c.kind.resourceType, c.target?.externalId]), [["tmdb", "company", "7"], ["tmdb", "network", "7"], ["igdb", "company", "9"]]);
  assert.equal(organizations.find(c => c.kind.resourceType === "network")?.bindings.length, 1);
});

test("bulk payload preserves filters and checkpoint while rejecting invalid input", () => {
  assert.deepEqual(parseCreatorImagesPayload({}), { batchSize: 25 });
  const checkpoint = { afterId: 1, throughId: 20, total: 3, processed: 1, failed: 0, storedImages: 1, missingImages: 0, skipped: 0, errors: [] };
  assert.deepEqual(parseCreatorImagesPayload({ creatorTypeId: 1, roleId: 2, batchSize: 100, checkpoint }), { creatorTypeId: 1, roleId: 2, batchSize: 100, checkpoint });
  for (const value of [null, [], { batchSize: 0 }, { batchSize: 101 }, { roleId: 0 }, { creatorTypeId: "1" }, { force: true }, { checkpoint: { ...checkpoint, afterId: 21 } }, { checkpoint: { ...checkpoint, failed: -1 } }]) assert.throws(() => parseCreatorImagesPayload(value));
  assert.deepEqual(parseCreatorImageFillPayload({ creatorId: 1, bindingFingerprint: "a".repeat(64) }), { creatorId: 1, bindingFingerprint: "a".repeat(64) });
  for (const value of [{ creatorId: 0 }, { creatorId: 1, bindingFingerprint: "bad" }, { creatorId: 1, extra: true }]) assert.throws(() => parseCreatorImageFillPayload(value));
});

serviceTest("existing manual or provider avatar never starts source discovery or HTTP", async () => {
  for (const source of ["manual", "tmdb"]) {
    const f = fixture();
    f.setState([{ ...f.getState()[0], creator: { ...f.getState()[0].creator, avatarObjectKey: "existing.webp", avatarSource: source } }] as State);
    f.deps.bindings = async () => { assert.fail("must not discover sources"); };
    assert.equal(await fillCreatorImage(1, signal(), {}, f.deps), "already-present");
    assert.deepEqual(f.calls, []);
  }
});

serviceTest("person uses FantLab first; confirmed missing image falls back to TMDB", async () => {
  const first = fixture();
  assert.equal(await fillCreatorImage(1, signal(), {}, first.deps), "stored");
  assert.deepEqual(first.calls, ["profile:fantlab", "attach", "image:fantlab", "portrait", "upload", "commit"]);
  const fallback = fixture();
  fallback.profiles.fantlab = { autor_id: 8, type: "autor", is_opened: true, name: "Автор", image: null };
  assert.equal(await fillCreatorImage(1, signal(), {}, fallback.deps), "stored");
  assert.deepEqual(fallback.calls.slice(0, 5), ["profile:fantlab", "attach", "profile:tmdb", "attach", "image:tmdb"]);
});

serviceTest("provider errors propagate instead of selecting another identity", async () => {
  const f = fixture(); const failure = new Error("HTTP 503");
  f.deps.fetchProfile = async target => { f.calls.push(`profile:${target.provider}`); throw failure; };
  await assert.rejects(fillCreatorImage(1, signal(), {}, f.deps), error => error === failure);
  assert.deepEqual(f.calls, ["profile:fantlab"]);
});

serviceTest("ambiguous bindings stop without network and unsupported sources remain explicit", async () => {
  const f = fixture();
  f.setBindings([...personBindings, { id: 3, provider: "fantlab", externalCreatorId: "9" }]);
  assert.equal(await fillCreatorImage(1, signal(), {}, f.deps), "ambiguous-binding");
  assert.deepEqual(f.calls, []);
  f.setBindings([{ id: 4, provider: "bgg", externalCreatorId: "1" }]);
  assert.equal(await fillCreatorImage(1, signal(), {}, f.deps), "unsupported-source");
  f.setBindings([]);
  assert.equal(await fillCreatorImage(1, signal(), {}, f.deps), "no-binding");
});

serviceTest("avatar appearing while acquiring profile prevents image download and upload", async () => {
  const f = fixture(); const fetch = f.deps.fetchProfile!;
  f.deps.fetchProfile = async (...args) => {
    const raw = await fetch(...args);
    f.setState([{ ...f.getState()[0], creator: { ...f.getState()[0].creator, avatarObjectKey: "concurrent.webp", avatarSource: "tmdb", avatarVersion: 3 } }] as State);
    return raw;
  };
  assert.equal(await fillCreatorImage(1, signal(), {}, f.deps), "source-changed");
  assert.deepEqual(f.calls, ["profile:fantlab", "attach"]);
});

serviceTest("rejected commit cleans uploaded object; accepted commit forwards guarded checkpoint", async () => {
  const rejected = fixture(); rejected.deps.commit = async () => false;
  assert.equal(await fillCreatorImage(1, signal(), {}, rejected.deps), "source-changed");
  assert.equal(rejected.calls.at(-1), "cleanup:creators/1/new.webp");
  const accepted = fixture(); const checkpoint = { checkpoint: { afterId: 1 } }; const guard = { runId: 3, lockToken: "lease" };
  assert.equal(await fillCreatorImage(1, signal(), { checkpoint, guard }, accepted.deps), "stored");
  assert.equal(accepted.commits[0].checkpoint, checkpoint);
  assert.equal(accepted.commits[0].guard, guard);
  assert.equal(accepted.commits[0].expectedVersion, 2);
  assert.equal(accepted.commits[0].binding.externalCreatorId, "8");
  assert.equal(accepted.commits[0].contentHash.length, 64);
  assert.equal(accepted.calls.some(call => call.startsWith("cleanup:")), false);
});

serviceTest("organization applies logo transform instead of portrait crop", async () => {
  const f = fixture(); f.setState([{ ...f.getState()[0], typeCode: "organization" }]);
  f.setBindings([{ id: 1, provider: "tmdb", externalCreatorId: "company:7" }]);
  assert.equal(await fillCreatorImage(1, signal(), {}, f.deps), "stored");
  assert.ok(f.calls.includes("logo")); assert.ok(!f.calls.includes("portrait"));
});

serviceTest("cancellation before work performs no I/O; cancellation after upload cleans unused object", async () => {
  const before = fixture(); const stopped = new AbortController(); stopped.abort();
  await assert.rejects(fillCreatorImage(1, stopped.signal, {}, before.deps), { name: "AbortError" });
  assert.deepEqual(before.calls, []);
  const after = fixture(); const controller = new AbortController(); const upload = after.deps.upload!;
  after.deps.upload = async input => { const result = await upload(input); controller.abort(); return result; };
  await assert.rejects(fillCreatorImage(1, controller.signal, {}, after.deps), { name: "AbortError" });
  assert.ok(!after.calls.includes("commit")); assert.equal(after.calls.at(-1), "cleanup:creators/1/new.webp");
});

serviceTest("obsolete binding fingerprint skips network and upload", async () => {
  const f = fixture();
  assert.equal(await fillCreatorImage(1, signal(), { bindingFingerprint: "0".repeat(64) }, f.deps), "source-changed");
  assert.deepEqual(f.calls, []);
});

serviceTest("malformed TMDB image evidence fails without falling back to IGDB", async () => {
  const f = fixture(); f.setState([{ ...f.getState()[0], typeCode: "organization" }]);
  f.setBindings([{ id: 1, provider: "tmdb", externalCreatorId: "company:7" }, { id: 2, provider: "igdb", externalCreatorId: "company:9" }]);
  f.profiles.tmdb = { id: 7, logo_path: "https://untrusted/image.png" };
  await assert.rejects(fillCreatorImage(1, signal(), {}, f.deps), /INVALID_CREATOR_IMAGE/);
  assert.deepEqual(f.calls, ["profile:tmdb", "attach"]);
});

test("explicit refresh validates exact binding and protects manual or foreign images", () => {
  assert.deepEqual(parseCreatorImageRefreshPayload({ creatorId: 1, bindingId: 2 }), { creatorId: 1, bindingId: 2 });
  for (const row of [{creatorId:1}, {creatorId:1,bindingId:0}, {creatorId:1,bindingId:2,force:true}]) assert.throws(() => parseCreatorImageRefreshPayload(row));
  const binding = {id:2,provider:"tmdb",externalCreatorId:"person:7"};
  assert.equal(canWriteCreatorImage({avatarObjectKey:"old.webp",avatarSource:"tmdb",avatarSourceExternalId:"person:7"},binding),true);
  for (const avatar of [{avatarSource:"manual",avatarSourceExternalId:null},{avatarSource:"fantlab",avatarSourceExternalId:"7"},{avatarSource:"tmdb",avatarSourceExternalId:"person:8"}]) assert.equal(canWriteCreatorImage({avatarObjectKey:"old.webp",...avatar},binding),false);
});
serviceTest("explicit refresh selects exact supported binding, requests fresh raw, and cleans replaced object", async () => {
  const f=fixture();
  f.setState([{...f.getState()[0],creator:{...f.getState()[0].creator,avatarObjectKey:"old.webp",avatarSource:"tmdb",avatarSourceExternalId:"person:7"}}] as State);
  const fetch=f.deps.fetchProfile!;
  f.deps.fetchProfile=async (target,options)=>{assert.equal(options?.onlyMissing,false);return fetch(target,options);};
  assert.equal(await fillCreatorImage(1,signal(),{refreshBindingId:2},f.deps),"stored");
  assert.equal(f.calls[0],"profile:tmdb");assert.equal(f.calls.at(-1),"cleanup:old.webp");
  assert.equal(f.commits[0].refresh,true);assert.equal(f.commits[0].binding.id,2);
});
serviceTest("explicit refresh never replaces manual or foreign identity and rejects inactive selected binding", async () => {
  for(const avatar of [{avatarSource:"manual",avatarSourceExternalId:null},{avatarSource:"fantlab",avatarSourceExternalId:"8"},{avatarSource:"tmdb",avatarSourceExternalId:"person:8"}]){
    const f=fixture();f.setState([{...f.getState()[0],creator:{...f.getState()[0].creator,avatarObjectKey:"old.webp",...avatar}}] as State);
    assert.equal(await fillCreatorImage(1,signal(),{refreshBindingId:2},f.deps),"already-present");assert.deepEqual(f.calls,[]);
  }
  const f=fixture();assert.equal(await fillCreatorImage(1,signal(),{refreshBindingId:99},f.deps),"source-changed");assert.deepEqual(f.calls,[]);
});
serviceTest("concurrent edit during refresh aborts image download",async()=>{
  const f=fixture();const fetch=f.deps.fetchProfile!;
  f.deps.fetchProfile=async(...args)=>{const raw=await fetch(...args);f.setState([{...f.getState()[0],creator:{...f.getState()[0].creator,avatarObjectKey:"manual.webp",avatarSource:"manual",avatarVersion:3}}] as State);return raw;};
  assert.equal(await fillCreatorImage(1,signal(),{refreshBindingId:2},f.deps),"source-changed");assert.deepEqual(f.calls,["profile:tmdb","attach"]);
});
