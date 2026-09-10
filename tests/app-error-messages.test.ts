import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  getAdminFormErrorCode,
  getAdminFormErrorMessage,
  getRuntimeErrorMessage,
  getRuntimeErrorTitle,
  getUniqueViolationConstraint,
  isDatabaseUnavailableError,
  isUniqueViolation,
} from "../src/lib/common/app-error-messages";

describe("app error messages", () => {
  it("recognizes unique constraint violations", () => {
    assert.equal(isUniqueViolation({ code: "23505" }), true);
    assert.equal(isUniqueViolation({ code: "23503" }), false);
    assert.equal(
      getUniqueViolationConstraint({
        code: "23505",
        constraint_name: "author_accounts_normalized_login_unique",
      }),
      "author_accounts_normalized_login_unique",
    );
    assert.equal(getUniqueViolationConstraint({ code: "23503" }), null);
    const wrappedViolation = {
      message: "Failed query: insert into author_emails",
      cause: {
        code: "23505",
        constraint_name: "author_emails_normalized_email_unique",
      },
    };
    assert.equal(isUniqueViolation(wrappedViolation), true);
    assert.equal(
      getUniqueViolationConstraint(wrappedViolation),
      "author_emails_normalized_email_unique",
    );
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

  it("suppresses global interactive overlays while the page error fallback is mounted", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const errorBoundary = readFileSync("src/app/error.tsx", "utf8");
    const availability = readFileSync(
      "src/components/external-interface/page-availability.tsx",
      "utf8",
    );
    const externalLayer = readFileSync(
      "src/components/external-interface/external-interface-layer.tsx",
      "utf8",
    );
    const achievementToasts = readFileSync(
      "src/components/achievements/achievement-toast-host.tsx",
      "utf8",
    );
    const notificationInbox = readFileSync(
      "src/components/notifications/notification-inbox.tsx",
      "utf8",
    );

    assert.match(layout, /<PageAvailabilityProvider>/);
    assert.match(errorBoundary, /useReportPageUnavailable\(\)/);
    assert.match(availability, /setPageUnavailable\(true\)/);
    assert.match(availability, /setPageUnavailable\(false\)/);
    assert.match(externalLayer, /!pageUnavailable && \(showTools/);
    assert.match(achievementToasts, /return pageUnavailable \? null/);
    assert.match(notificationInbox, /pageUnavailable \? \[\] : toastMessages/);
  });

  it("maps oversized image uploads to a 413 message instead of a silent 503", () => {
    const bodyExceeded = new Error("Body exceeded 1 MB limit.");
    const nginxStyle = new Error("An unexpected response was received from the server.");
    assert.equal(getRuntimeErrorTitle(bodyExceeded), "413");
    assert.equal(getRuntimeErrorTitle(nginxStyle), "413");
    assert.match(getRuntimeErrorMessage(bodyExceeded) ?? "", /5 МБ/);
    assert.match(getRuntimeErrorMessage(nginxStyle) ?? "", /5 МБ/);
    assert.equal(getRuntimeErrorTitle({ status: 413, message: "Request Entity Too Large" }), "413");
    const fallback = readFileSync("src/app/error-fallback.tsx", "utf8");
    const form = readFileSync("src/components/forms/image-upload-form.tsx", "utf8");
    assert.match(fallback, /getRuntimeErrorTitle\(error\)/);
    assert.match(form, /getImageUploadRejectedMessage/);
    assert.match(form, /unstable_rethrow/);
  });
});
