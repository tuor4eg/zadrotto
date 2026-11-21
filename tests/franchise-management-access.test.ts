import assert from "node:assert/strict";
import test from "node:test";
import { canManageFranchises } from "../src/lib/franchises/access";

test("only interactive trusted authors can manage franchises", () => {
  assert.equal(canManageFranchises(null), false);
  assert.equal(canManageFranchises(undefined), false);
  assert.equal(canManageFranchises({ accessProfileCode: "regular", isSystem: false }), false);
  assert.equal(canManageFranchises({ accessProfileCode: "system", isSystem: true }), false);
  assert.equal(canManageFranchises({ accessProfileCode: "trusted", isSystem: true }), false);
  assert.equal(canManageFranchises({ accessProfileCode: "trusted", isSystem: false }), true);
});
