import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTHOR_SESSION_COOKIE_NAME,
  generateAuthorSessionToken,
  hashAuthorSessionToken,
} from "../src/lib/auth/author-session";
import { isFreshAccessTokenSession } from "../src/lib/auth/author-auth";

describe("opaque author session tokens", () => {
  it("uses the v2 cookie name", () => {
    assert.equal(AUTHOR_SESSION_COOKIE_NAME, "author_session_v2");
  });

  it("generates random opaque tokens without embedded claims", () => {
    const firstToken = generateAuthorSessionToken();
    const secondToken = generateAuthorSessionToken();

    assert.match(firstToken, /^zas_[A-Za-z0-9_-]+$/);
    assert.equal(firstToken.includes("."), false);
    assert.notEqual(firstToken, secondToken);
  });

  it("hashes tokens deterministically without storing the raw value", () => {
    const token = generateAuthorSessionToken();
    const tokenHash = hashAuthorSessionToken(token);

    assert.equal(tokenHash, hashAuthorSessionToken(token));
    assert.notEqual(tokenHash, token);
    assert.match(tokenHash, /^[a-f0-9]{64}$/);
  });

  it("limits onboarding to fresh access-token sessions", () => {
    const now = new Date("2026-07-20T12:00:00Z");
    assert.equal(
      isFreshAccessTokenSession(
        { authMethod: "access_token", createdAt: new Date("2026-07-20T11:45:00Z") },
        now,
      ),
      true,
    );
    assert.equal(
      isFreshAccessTokenSession(
        { authMethod: "access_token", createdAt: new Date("2026-07-20T11:46:00Z") },
        now,
      ),
      true,
    );
    assert.equal(
      isFreshAccessTokenSession(
        { authMethod: "access_token", createdAt: new Date("2026-07-20T11:44:59Z") },
        now,
      ),
      false,
    );
    assert.equal(
      isFreshAccessTokenSession(
        { authMethod: "password", createdAt: new Date("2026-07-20T11:59:00Z") },
        now,
      ),
      false,
    );
  });
});
