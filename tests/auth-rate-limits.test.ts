import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADMIN_AUTH_RATE_LIMITS,
  AUTHOR_AUTH_RATE_LIMITS,
  buildAuthRateLimitInputs,
  checkAuthRateLimitWithChecker,
  getAuthRequestIpAddressFromHeaders,
  normalizeAuthIdentitySubject,
} from "@/lib/auth/rate-limits";

describe("auth rate limits", () => {
  it("builds admin limits from ip and normalized identity", () => {
    assert.equal(normalizeAuthIdentitySubject(" Admin "), "admin");
    assert.deepEqual(
      buildAuthRateLimitInputs({
        scope: "admin",
        ipAddress: " 127.0.0.1 ",
        identitySubject: " Admin ",
        limits: ADMIN_AUTH_RATE_LIMITS,
      }),
      [
        {
          keyPrefix: "auth:admin:identity",
          subject: "127.0.0.1:admin",
          window: "quarter-hour",
          limit: 5,
        },
        {
          keyPrefix: "auth:admin:ip",
          subject: "127.0.0.1",
          window: "hour",
          limit: 20,
        },
      ],
    );
  });

  it("builds author limits from neutral identity subject", () => {
    assert.deepEqual(
      buildAuthRateLimitInputs({
        scope: "author",
        ipAddress: "203.0.113.10",
        identitySubject: "stable-credential-hash",
        limits: AUTHOR_AUTH_RATE_LIMITS,
      }),
      [
        {
          keyPrefix: "auth:author:identity",
          subject: "203.0.113.10:stable-credential-hash",
          window: "quarter-hour",
          limit: 10,
        },
        {
          keyPrefix: "auth:author:ip",
          subject: "203.0.113.10",
          window: "quarter-hour",
          limit: 10,
        },
      ],
    );
  });

  it("limits empty author credential only by ip", () => {
    assert.deepEqual(
      buildAuthRateLimitInputs({
        scope: "author",
        ipAddress: "203.0.113.10",
        identitySubject: null,
        limits: AUTHOR_AUTH_RATE_LIMITS,
      }),
      [
        {
          keyPrefix: "auth:author:ip",
          subject: "203.0.113.10",
          window: "quarter-hour",
          limit: 10,
        },
      ],
    );
  });

  it("maps unavailable redis result to auth unavailable", async () => {
    const result = await checkAuthRateLimitWithChecker(
      {
        scope: "admin",
        ipAddress: "127.0.0.1",
        identitySubject: "admin",
        limits: ADMIN_AUTH_RATE_LIMITS,
      },
      async () => ({ ok: false, error: "unavailable" }),
    );

    assert.deepEqual(result, { ok: false, reason: "unavailable" });
  });

  it("reads client ip from proxy headers", () => {
    assert.equal(
      getAuthRequestIpAddressFromHeaders({
        get(name) {
          return name === "x-forwarded-for" ? " 198.51.100.7, 198.51.100.8 " : null;
        },
      }),
      "198.51.100.7",
    );
    assert.equal(
      getAuthRequestIpAddressFromHeaders({
        get(name) {
          return name === "x-real-ip" ? "203.0.113.3" : null;
        },
      }),
      "203.0.113.3",
    );
  });
});
