import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAdminFormErrorCode,
  getAdminFormErrorMessage,
  getRuntimeErrorMessage,
  getRuntimeErrorTitle,
  isDatabaseUnavailableError,
  isUniqueViolation,
} from "../src/lib/app-error-messages";

describe("app error messages", () => {
  it("recognizes unique constraint violations", () => {
    assert.equal(isUniqueViolation({ code: "23505" }), true);
    assert.equal(isUniqueViolation({ code: "23503" }), false);
  });

  it("recognizes unavailable database errors by code, message, and cause", () => {
    assert.equal(isDatabaseUnavailableError({ code: "ECONNREFUSED" }), true);
    assert.equal(isDatabaseUnavailableError({ code: "57P03" }), true);
    assert.equal(isDatabaseUnavailableError(new Error("connection terminated")), true);
    assert.equal(
      isDatabaseUnavailableError({ cause: { code: "ETIMEDOUT" } }),
      true,
    );
    assert.equal(isDatabaseUnavailableError({ code: "23505" }), false);
  });

  it("maps admin form errors to safe user-facing messages", () => {
    assert.equal(getAdminFormErrorCode({ code: "ECONNREFUSED" }), "service-unavailable");
    assert.equal(getAdminFormErrorCode({ code: "23503" }), "operation-failed");
    assert.match(
      getAdminFormErrorMessage("service-unavailable") ?? "",
      /503/i,
    );
    assert.equal(getAdminFormErrorMessage("unknown"), null);
  });

  it("uses a generic 503 runtime fallback", () => {
    assert.equal(getRuntimeErrorTitle(), "503");
    assert.equal(getRuntimeErrorMessage(), "Сервис временно недоступен.");
  });
});
