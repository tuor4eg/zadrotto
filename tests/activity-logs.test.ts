import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIVITY_SEVERITY_LABELS,
  getDefaultActivitySeverity,
  getActivityActionLabel,
  getActivityEntityTypeLabel,
  sanitizeActivityLogMetadata,
} from "@/lib/activity-logs/model";

describe("activity log metadata", () => {
  it("removes secret-like fields from metadata", () => {
    const sanitized = sanitizeActivityLogMetadata({
      login: "admin",
      password: "plain",
      accessToken: "token-value",
      sessionCookie: "cookie-value",
      providerCredentials: {
        apiKey: "secret-value",
      },
      nested: {
        safe: "value",
        encryptedPayload: "ciphertext",
      },
      changedAt: new Date("2026-06-21T12:00:00.000Z"),
    });

    assert.deepEqual(sanitized, {
      login: "admin",
      nested: {
        safe: "value",
      },
      changedAt: "2026-06-21T12:00:00.000Z",
    });
  });

  it("returns null when all metadata fields are secret", () => {
    const sanitized = sanitizeActivityLogMetadata({
      token: "token-value",
      passwordHash: "hash",
    });

    assert.equal(sanitized, null);
  });
});

describe("activity log labels", () => {
  it("returns Russian labels for known actions and entity types", () => {
    assert.equal(getActivityActionLabel("admin.login"), "Вход админа");
    assert.equal(getActivityActionLabel("franchise.media.attached"), "Запись добавлена в серию");
    assert.equal(getActivityEntityTypeLabel("media-item"), "Запись");
    assert.equal(ACTIVITY_SEVERITY_LABELS.critical, "Критично");
  });

  it("falls back to raw values for unknown labels", () => {
    assert.equal(getActivityActionLabel("custom.action"), "custom.action");
    assert.equal(getActivityEntityTypeLabel("custom-entity"), "custom-entity");
    assert.equal(getActivityEntityTypeLabel(null), null);
  });
});

describe("activity log severity", () => {
  it("returns warning for ordinary failures", () => {
    assert.equal(
      getDefaultActivitySeverity({
        action: "admin.login.failed",
        status: "failure",
      }),
      "warning",
    );
  });

  it("returns critical for sensitive destructive or security actions", () => {
    assert.equal(
      getDefaultActivitySeverity({
        action: "admin.password.changed",
        status: "success",
      }),
      "critical",
    );
    assert.equal(
      getDefaultActivitySeverity({
        action: "author-token.deleted",
        status: "success",
      }),
      "critical",
    );
  });

  it("returns info for ordinary successful actions", () => {
    assert.equal(
      getDefaultActivitySeverity({
        action: "media.updated",
        status: "success",
      }),
      "info",
    );
  });
});
