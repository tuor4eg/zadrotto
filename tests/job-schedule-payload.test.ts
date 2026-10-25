import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobPayloadFields } from "../src/app/admin/(protected)/tools/jobs/job-payload-fields";

function submittedPayload(type: string, payload: Record<string, unknown>) {
  const html = renderToStaticMarkup(createElement(JobPayloadFields, { type, initialPayload: payload }));
  const value = html.match(/name="payload" value="([^"]*)"/)?.[1];
  assert.ok(value);
  return JSON.parse(value.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
}
test("untouched typed schedule forms preserve configured values, zero reserve and other payload fields", () => {
  for (const [type, payload] of [
    ["media.metadata-backfill", { limit: 13, quotaReserve: 0, mediaType: "film", force: false, partsOnly: false }],
    ["media.metadata-refresh", { limit: 11, staleDays: 123, quotaReserve: 432 }],
    ["media.cover-thumbnails-backfill", { limit: 37, mediaItemId: 42 }],
    ["media.rating-stats-reconcile", { batchSize: 456, afterMediaItemId: 789 }],
  ] as const) assert.deepEqual(submittedPayload(type, payload), payload);
});
test("handlers without parameter forms omit payload on edit so the server retains it", () => {
  const html = renderToStaticMarkup(createElement(JobPayloadFields, { type: "domain-events.dispatch", initialPayload: { limit: 19 }, preserveWithoutFields: true }));
  assert.doesNotMatch(html, /name="payload"/);
  assert.deepEqual(submittedPayload("domain-events.dispatch", { limit: 19 }), { limit: 19 });
});
