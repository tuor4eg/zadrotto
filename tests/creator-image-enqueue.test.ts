import assert from "node:assert/strict";
import { test } from "node:test";
import { enqueueCreatorImageFill } from "../src/db/queries/creator-image-jobs";
import type { CreatorTransaction } from "../src/db/queries/creators";
import { creatorImageBindingFingerprint } from "../src/lib/creators/image-fingerprint";

function transaction(bindings: { id: number; provider: string; externalCreatorId: string }[], activeJob?: number) {
  const inserted: Record<string, unknown>[] = [];
  const locks: string[] = [];
  let advisoryLocks = 0;
  const tx = {
    execute: async () => { advisoryLocks++; locks.push("advisory"); },
    select: () => ({ from: () => ({ where: () => ({
      for: async () => { locks.push("creator"); return [{ id: 7 }]; },
      orderBy: async () => bindings,
      limit: async () => activeJob === undefined ? [] : [{ id: activeJob }],
    }) }) }),
    insert: () => ({ values: (values: Record<string, unknown>) => {
      inserted.push(values);
      return { returning: async () => [{ id: 42, ...values }] };
    } }),
  } as unknown as CreatorTransaction;
  return { tx, inserted, locks, advisoryLocks: () => advisoryLocks };
}

test("Creator image enqueue is transactional and supports creation before any binding", async () => {
  const state = transaction([]);
  await enqueueCreatorImageFill(state.tx, 7);
  assert.equal(state.advisoryLocks(), 1);
  assert.deepEqual(state.locks, ["creator", "advisory"]);
  assert.equal(state.inserted.length, 1);
  assert.equal(state.inserted[0].type, "media.creator-image-fill");
  assert.equal(state.inserted[0].source, "event");
  const payload = state.inserted[0].payload as { creatorId: number; bindingFingerprint: string };
  assert.equal(payload.creatorId, 7);
  assert.match(payload.bindingFingerprint, /^[a-f0-9]{64}$/);
  const confirmed = transaction([{ id: 1, provider: "tmdb", externalCreatorId: "person:9" }]);
  await enqueueCreatorImageFill(confirmed.tx, 7);
  assert.notDeepEqual(confirmed.inserted[0].payload, payload);
  const repeated = transaction([{ id: 1, provider: "tmdb", externalCreatorId: "person:9" }]);
  await enqueueCreatorImageFill(repeated.tx, 7);
  assert.deepEqual(repeated.inserted[0].payload, confirmed.inserted[0].payload);
});

test("an active job with the current binding fingerprint prevents duplicate enqueue", async () => {
  const state = transaction([{ id: 1, provider: "tmdb", externalCreatorId: "company:9" }], 13);
  assert.deepEqual(await enqueueCreatorImageFill(state.tx, 7), { id: 13 });
  assert.equal(state.inserted.length, 0);
});

test("image identity fingerprints ignore query order and unrelated binding fields", () => {
  const person = { id: 2, provider: "tmdb", externalCreatorId: "person:9", externalCreatorName: "Name" };
  const company = { id: 1, provider: "igdb", externalCreatorId: "company:9" };
  assert.equal(creatorImageBindingFingerprint([person, company]), creatorImageBindingFingerprint([company, person]));
  assert.notEqual(creatorImageBindingFingerprint([person]), creatorImageBindingFingerprint([{ ...person, id: 3 }]));
  assert.notEqual(creatorImageBindingFingerprint([person]), creatorImageBindingFingerprint([{ ...person, externalCreatorId: "company:9" }]));
});
