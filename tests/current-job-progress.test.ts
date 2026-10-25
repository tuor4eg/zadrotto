import assert from "node:assert/strict";
import { test } from "node:test";
import { getJobProgress } from "../src/lib/jobs/progress";
import { CurrentJobProgress } from "../src/app/admin/(protected)/tools/jobs/current/job-progress";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

test("snapshot progress uses explicit target count and completed successes plus failures", () => {
  const progress = getJobProgress("provider.snapshots", { mediaItemIds: [1,2,3,4], checkpoint: { processed:2,failed:1 } });
  assert.equal(progress.percent,75); assert.equal(progress.done,3); assert.equal(progress.total,4);
  assert.deepEqual(progress.stats,[{ label:"Обработано",value:2 },{ label:"Ошибок",value:1 }]);
  const profiles = getJobProgress("provider.snapshots", { profileTargets:[{},{}], profileCheckpoint:{ nextTargetIndex:1,processed:1,failed:0 } });
  assert.equal(profiles.percent,50);
});
test("cursors, sparse IDs and stage-local queues never fabricate a percentage", () => {
  for (const progress of [getJobProgress("provider.snapshots", { checkpoint:{ afterId:900,throughId:1000,processed:5,failed:1 } }), getJobProgress("media.platform-logos-sync", { checkpoint:{ position:5,total:10,stage:"images",counters:{ processedPlatforms:3,storedImages:2 } } })]) assert.equal(progress.percent,null);
  assert.equal(getJobProgress("media.platform-logos-sync", { checkpoint:{ stage:"images" } }).stage,"Изображения");
  assert.equal(getJobProgress("other", { checkpoint:{ stage:"private-token" } }).stage,null);
});
test("malformed counters and raw payload are not exposed as progress", () => {
  const progress=getJobProgress("unknown",{ secret:"do-not-render",checkpoint:{ processed:-1,failed:"token",total:NaN,errors:[],stage:"secret" } });
  assert.equal(progress.percent,null); assert.deepEqual(progress.stats,[]);
  const html=renderToStaticMarkup(createElement(CurrentJobProgress,{ progress,running:true }));
  assert.match(html,/role="progressbar"/); assert.doesNotMatch(html,/aria-valuenow|do-not-render|token/);
  assert.match(html,/Общий объём неизвестен/);
});
test("known total renders accessible determinate progress, clamped to 100", () => {
  const progress=getJobProgress("provider.snapshots",{ creatorIds:[1],checkpoint:{ processed:2,failed:0 } });
  const html=renderToStaticMarkup(createElement(CurrentJobProgress,{ progress,running:true }));
  assert.equal(progress.percent,100); assert.match(html,/aria-valuenow="100"/);
});
test("missing-only and multi-source Creator runs do not use requested IDs as a work total", () => {
  assert.equal(getJobProgress("provider.snapshots",{ creatorIds:[1],profileCheckpoint:{ processed:2,failed:0 } }).percent,null);
  assert.equal(getJobProgress("provider.snapshots",{ mediaItemIds:[1,2],onlyMissingSnapshots:true,checkpoint:{ processed:1,failed:0 } }).percent,null);
});
