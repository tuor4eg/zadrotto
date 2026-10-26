import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import assert from "node:assert/strict";
import { test } from "node:test";
import { enqueueCreatorImageFill, enqueueCreatorImageFills } from "../src/db/queries/creator-image-jobs";
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

type BatchBinding = { creatorId: number; id: number; provider: string; externalCreatorId: string };
function batchTransaction(owners: number[], bindings: BatchBinding[], active: { creatorId: number; bindingFingerprint: string }[] = []) {
  const inserted: Record<string, unknown>[] = [];
  const selects: string[] = [];
  const locks: number[][] = [];
  const ownerParams: unknown[][] = [];
  let step = 0;
  const dialect = new PgDialect();
  const tx = {
    select: () => {
      const query = step++;
      selects.push(["owners", "bindings", "active-jobs"][query] ?? "unexpected");
      return { from: () => ({ where: (condition: SQL) => {
        if (query === 0) {
          const ids = dialect.sqlToQuery(condition).params;
          ownerParams.push(ids);
          return { orderBy: () => ({ for: async (mode: string) => {
            assert.equal(mode, "update");
            const selected = owners.filter(id => ids.includes(id)).sort((a,b) => a-b);
            locks.push(selected);
            return selected.map(id => ({ id }));
          } }) };
        }
        if (query === 1) return { orderBy: async () => bindings };
        if (query === 2) return Promise.resolve(active.map(payload => ({ payload })));
        assert.fail("unbounded batch query");
      } }) };
    },
    insert: () => ({ values: (values: Record<string, unknown>[]) => {
      inserted.push(...values);
      return { onConflictDoNothing: () => ({ returning: async () => values.map((_,i) => ({id:100+i})) }) };
    } }),
    execute: async () => { assert.fail("batch must use its single ordered owner lock instead of per-owner advisory calls"); },
  } as unknown as CreatorTransaction;
  return { tx, inserted, selects, locks, ownerParams };
}

test("batch enqueue deduplicates owner IDs and compares active fingerprints per owner", async () => {
  const first = {creatorId:7,id:1,provider:"anilist",externalCreatorId:"person:7"};
  const second = {creatorId:9,id:3,provider:"igdb",externalCreatorId:"company:9"};
  const third = {creatorId:9,id:2,provider:"tmdb",externalCreatorId:"company:9"};
  const fingerprint7 = creatorImageBindingFingerprint([first]);
  const fingerprint9 = creatorImageBindingFingerprint([second,third]);
  const state = batchTransaction([7,9,10], [first,second,third], [
    {creatorId:7,bindingFingerprint:fingerprint7},
    {creatorId:9,bindingFingerprint:fingerprint7}, // Another owner's fingerprint cannot suppress this owner.
    {creatorId:10,bindingFingerprint:fingerprint9}, // Stale bindings cannot suppress a new identity state.
  ]);
  assert.deepEqual(await enqueueCreatorImageFills(state.tx,[10,9,7,9,7,999]),[{id:100},{id:101}]);
  assert.deepEqual(state.ownerParams,[[7,9,10,999]]);
  assert.deepEqual(state.locks,[[7,9,10]]);
  assert.deepEqual(state.selects,["owners","bindings","active-jobs"]);
  assert.deepEqual(state.inserted.map(row => row.payload),[
    {creatorId:9,bindingFingerprint:fingerprint9},
    {creatorId:10,bindingFingerprint:creatorImageBindingFingerprint([])},
  ]);
  assert.ok(state.inserted.every(row => row.type === "media.creator-image-fill" && row.source === "event"));
});

test("batch enqueue keeps reads and lock roundtrips constant as owner count grows",async()=>{
  for(const count of [1,25]) {
    const owners=Array.from({length:count},(_,i)=>i+1);
    const state=batchTransaction(owners,owners.map(id=>({creatorId:id,id,provider:"anilist",externalCreatorId:`person:${id}`})));
    await enqueueCreatorImageFills(state.tx,[...owners].reverse());
    assert.equal(state.selects.length,3);
    assert.equal(state.locks.length,1);
    assert.deepEqual(state.locks[0],owners);
    assert.equal(state.inserted.length,count);
  }
  const empty=batchTransaction([],[]);
  assert.deepEqual(await enqueueCreatorImageFills(empty.tx,[]),[]);
  assert.equal(empty.selects.length,0);
  assert.deepEqual(await enqueueCreatorImageFills(empty.tx,[99,99]),[]);
  assert.equal(empty.selects.length,1);
  assert.equal(empty.inserted.length,0);
});
