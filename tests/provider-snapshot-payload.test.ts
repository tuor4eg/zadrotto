import assert from "node:assert/strict";
import { test } from "node:test";
import { getSnapshotBatchSettings, parseSnapshotJobPayload } from "../src/lib/providers/snapshot-job-payload";
import { canonicalJson, snapshotHash, validateSnapshotReferences } from "../src/lib/providers/snapshot-values";

test("snapshot operations reject unsupported sources, invalid ranges and forged checkpoints",()=>{
  assert.equal(parseSnapshotJobPayload({operation:"refresh-process",provider:"fantlab",mediaItemIds:[1]}).provider,"fantlab");
  assert.equal(parseSnapshotJobPayload({operation:"process",provider:"tmdb",mediaItemIds:[42]}).provider,"tmdb");
  for(const input of [{operation:"delete"},{operation:"process",provider:"rawg"},{operation:"verify",mediaItemIds:[0]},{operation:"verify",afterId:-1},
    {operation:"process",checkpoint:{afterId:0,throughId:10,processed:0,failed:0,errors:[],retryId:-1}}]) assert.throws(()=>parseSnapshotJobPayload(input));
});
test("snapshot fingerprints canonicalize objects without reordering arrays",()=>{
  assert.equal(snapshotHash({b:2,a:1}),snapshotHash({a:1,b:2}));
  assert.notEqual(snapshotHash([1,2]),snapshotHash([2,1]));
  assert.equal(canonicalJson({b:null,a:["x"]}),'{"a":["x"],"b":null}');
  const ref={id:1,payloadHash:snapshotHash({a:1})};
  assert.equal(validateSnapshotReferences([ref]),true);
  assert.equal(validateSnapshotReferences([ref,ref]),false);
  assert.equal(validateSnapshotReferences([{...ref,id:-1}]),false);
});

test("missing raw filter applies to network operations for media and creators, with historical false accepted", () => {
  for (const provider of ["fantlab", "google-books", "open-library", "tmdb"]) {
    for (const operation of ["refresh", "refresh-process"]) assert.equal(parseSnapshotJobPayload({ operation, provider, onlyMissingSnapshots: true }).onlyMissingSnapshots, true);
    for (const operation of ["process", "verify"]) {
      assert.throws(() => parseSnapshotJobPayload({ operation, provider, onlyMissingSnapshots: true }));
      assert.equal(parseSnapshotJobPayload({ operation, provider, onlyMissingSnapshots: false }).onlyMissingSnapshots, false);
    }
  }
  assert.throws(() => parseSnapshotJobPayload({ operation: "refresh", onlyMissingSnapshots: "true" }));
});

test("batch settings preserve old defaults, fractional hours, daily pauses and the remaining records after a retry",()=>{
  assert.deepEqual(getSnapshotBatchSettings(parseSnapshotJobPayload({operation:"refresh"})),{batchSize:25,batchPauseHours:0,pauseSeconds:1,remaining:25});
  for(const [hours,seconds] of [[0,1],[0.5,1800],[1,3600],[24,86400]]) {
    const payload=parseSnapshotJobPayload({operation:"process",batchSize:10,batchPauseHours:hours,checkpoint:{afterId:7,throughId:100,processed:5,failed:2,errors:[],retryId:8,retryCount:1}});
    const settings=getSnapshotBatchSettings(payload);
    assert.equal(settings.remaining,3,'a retry must not start a fresh full batch');assert.equal(settings.pauseSeconds,seconds);
  }
  for(const batchSize of [0,-1,1.5,101,Infinity,"25"])assert.throws(()=>parseSnapshotJobPayload({operation:"verify",batchSize}));
  for(const batchPauseHours of [-1,Infinity,NaN,8761,"1"])assert.throws(()=>parseSnapshotJobPayload({operation:"verify",batchPauseHours}));
});
