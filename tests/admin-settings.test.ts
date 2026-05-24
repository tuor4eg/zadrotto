import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateAdminPasswordChange } from "../src/lib/admin-settings";

describe("admin password settings", () => {
  it("accepts a complete password change", () => {
    assert.equal(
      validateAdminPasswordChange({
        currentPassword: "old-password",
        newPassword: "new-password",
        newPasswordConfirmation: "new-password",
      }),
      null,
    );
  });

  it("requires all password fields", () => {
    assert.equal(
      validateAdminPasswordChange({
        currentPassword: "",
        newPassword: "new-password",
        newPasswordConfirmation: "new-password",
      }),
      "required",
    );
  });

  it("rejects a short new password", () => {
    assert.equal(
      validateAdminPasswordChange({
        currentPassword: "old-password",
        newPassword: "short",
        newPasswordConfirmation: "short",
      }),
      "too-short",
    );
  });

  it("requires confirmation to match the new password", () => {
    assert.equal(
      validateAdminPasswordChange({
        currentPassword: "old-password",
        newPassword: "new-password",
        newPasswordConfirmation: "another-password",
      }),
      "confirmation-mismatch",
    );
  });

  it("requires the new password to differ from the current one", () => {
    assert.equal(
      validateAdminPasswordChange({
        currentPassword: "same-password",
        newPassword: "same-password",
        newPasswordConfirmation: "same-password",
      }),
      "same-password",
    );
  });
});
