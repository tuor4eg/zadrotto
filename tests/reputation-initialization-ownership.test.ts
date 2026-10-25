import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isReputationInitializationRequest } from "../src/lib/reputation/initialization-request";

const requested = { type: "reputation.initialize", source: "manual", createdByAdminId: 7,
  payload: { initializationRequested: true } };

test("only the explicitly requested manual initialization owns settings", () => {
  assert.equal(isReputationInitializationRequest(requested), true);
  for (const invalid of [
    { ...requested, payload: {} },
    { ...requested, payload: { initializationRequested: "true" } },
    { ...requested, source: "schedule" },
    { ...requested, createdByAdminId: null },
    { ...requested, type: "reputation.promote-trusted" },
  ]) assert.equal(isReputationInitializationRequest(invalid), false);
});

test("failure cannot unconditionally disable enabled settings or bypass lease fencing", () => {
  const query = readFileSync("src/db/queries/reputation.ts", "utf8");
  const cleanup = query.slice(query.indexOf("export async function failReputationInitialization"), query.indexOf("export async function beginReputationInitialization"));
  assert.match(cleanup, /withSnapshotJobGuard\(guard/);
  assert.match(cleanup, /assertReputationInitializationOwner\(tx, guard\)/);
  assert.match(cleanup, /eq\(levelSettings\.status, "initializing"\)/);
  const initializer = readFileSync("src/lib/reputation/initialize.ts", "utf8");
  assert.ok(initializer.indexOf("assertReputationInitializationOwner(tx, jobGuard)") < initializer.indexOf("pg_advisory_xact_lock"));
  const handler = readFileSync("src/lib/reputation/initialization-job.ts", "utf8");
  assert.match(handler, /\["invalid-initialization", "lease-lost"\]\.includes\(error\.code\)/);
  assert.doesNotMatch(handler, /setReputationSystemStatus/);
});

test("orphan recovery is explicit, rejects active runs and preserves saved configuration", () => {
  const query = readFileSync("src/db/queries/reputation.ts", "utf8");
  const begin = query.slice(query.indexOf("export async function beginReputationInitialization"));
  assert.match(begin, /if \(active\.length\) return null/);
  assert.match(begin, /input\.recoverOrphaned\s*\? eq\(levelSettings\.status, "initializing"\)/);
  assert.match(begin, /payload: \{ initializationRequested: true \}/);
  const actions = readFileSync("src/app/admin/(protected)/reputation/actions.ts", "utf8");
  const recovery = actions.slice(actions.indexOf("export async function recoverReputationInitializationAction"), actions.indexOf("export async function disableReputationAction"));
  assert.match(recovery, /requireAdminUser/);
  assert.match(recovery, /recoverOrphaned: true/);
  assert.doesNotMatch(recovery, /saveReputationConfiguration|setReputationSystemStatus/);
  const ui = readFileSync("src/app/admin/(protected)/reputation/reputation-settings.tsx", "utf8");
  assert.match(ui, /status === "initializing" \? \([\s\S]*?onClick=\{recoverInitialization\}/);
});

test("initialization enqueue serializes recovery before looking for active runs", () => {
  const query = readFileSync("src/db/queries/reputation.ts", "utf8");
  const begin = query.slice(query.indexOf("export async function beginReputationInitialization"));
  assert.ok(begin.indexOf("pg_advisory_xact_lock(90420262)") < begin.indexOf("const active ="));
  assert.ok(begin.indexOf("if (active.length) return null") < begin.indexOf("tx.update(levelSettings)"));
});
