import assert from "node:assert/strict";
import test from "node:test";
import { traceMediaSave } from "../src/lib/media/save-timing";

test("save timing records stages and preserves results, redirects and errors", async t => {
  const events: Array<{ requestId: string; event: string; stage?: string }> = [];
  const logs: Array<{ operation: string; durationMs: number; stages: Array<{ name: string; durationMs: number }> }> = [];
  t.mock.method(console, "info", (prefix: string, value: string) => {
    assert.equal(prefix, "[media-save-timing]");
    const entry = JSON.parse(value);
    events.push(entry);
    if (entry.event === "finished") logs.push(entry);
  });
  const value = await traceMediaSave("create", async timing => {
    timing.stage("database");
    return 42;
  });
  assert.equal(value, 42);
  const redirect = new Error("NEXT_REDIRECT");
  await assert.rejects(traceMediaSave("redirect", async timing => {
    timing.stage("publication");
    throw redirect;
  }), error => error === redirect);
  assert.equal(logs.length, 2);
  assert.deepEqual(logs[0].stages.map(stage => stage.name), ["start", "database"]);
  assert.equal(logs[1].operation, "redirect");
  assert.deepEqual(events.map(entry => entry.event), ["start", "stage", "finished", "start", "stage", "finished"]);
  assert.equal(events[1].stage, "database");
  assert.equal(events[0].requestId, events[2].requestId);
  assert.notEqual(events[0].requestId, events[3].requestId);
  for (const log of logs) {
    assert.ok(log.durationMs >= 0);
    assert.ok(log.stages.every(stage => stage.durationMs >= 0));
  }
});
