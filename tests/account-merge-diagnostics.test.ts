import assert from "node:assert/strict";
import { test } from "node:test";
import { getAccountMergeFailureDiagnostic } from "../src/lib/auth/account-merge-diagnostics";

test("merge diagnostics unwrap database errors without query, parameters or private values", () => {
  const database = Object.assign(new Error("email=private@example.com token=secret"), {
    code: "23505", constraint_name: "ledger_unique", table_name: "author_action_ledger",
    query: "insert private text", parameters: ["password"], detail: "private user value",
  });
  const wrapper = Object.assign(new Error("query wrapper", { cause: database }), { mergeStage: "transfer-data" });
  const diagnostic = getAccountMergeFailureDiagnostic(wrapper);
  assert.deepEqual(diagnostic, { errorName: "Error", stage: "transfer-data", sqlState: "23505", constraint: "ledger_unique", table: "author_action_ledger" });
  assert.doesNotMatch(JSON.stringify(diagnostic), /private|secret|password|insert/);
});

test("merge diagnostics handle cycles and reject arbitrary database identifiers", () => {
  const error: Record<string, unknown> = { code: "secret-token", table: "private@example.com", constraint: "statement with user data" };
  error.cause = error;
  assert.deepEqual(getAccountMergeFailureDiagnostic(error), { errorName: "UnknownError" });
  assert.deepEqual(getAccountMergeFailureDiagnostic(null), { errorName: "UnknownError" });
});

test("merge diagnostics retain allowlisted client driver codes and the underlying error type", () => {
  const underlying = Object.assign(new Error("query and secrets"), { code: "MAX_PARAMETERS_EXCEEDED" });
  const wrapper = Object.assign(new Error("query wrapper", { cause: underlying }), { mergeStage: "reconcile-reputation" });
  assert.deepEqual(getAccountMergeFailureDiagnostic(wrapper), { errorName: "Error", stage: "reconcile-reputation", driverCode: "MAX_PARAMETERS_EXCEEDED" });
  assert.deepEqual(getAccountMergeFailureDiagnostic(new Error("wrapper", { cause: new TypeError("private data") })), { errorName: "Error", causeName: "TypeError" });
});
