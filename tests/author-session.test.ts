import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTHOR_SESSION_COOKIE_NAME,
  generateAuthorSessionToken,
  hashAuthorSessionToken,
} from "../src/lib/auth/author-session";

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
});
