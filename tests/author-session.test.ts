import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthorSessionToken, verifyAuthorSessionToken } from "../src/lib/auth/author-session";

const previousAuthorSessionSecret = process.env.AUTHOR_SESSION_SECRET;

function withAuthorSessionSecret(secret: string) {
  process.env.AUTHOR_SESSION_SECRET = secret;
}

function restoreAuthorSessionSecret() {
  if (previousAuthorSessionSecret === undefined) {
    delete process.env.AUTHOR_SESSION_SECRET;
  } else {
    process.env.AUTHOR_SESSION_SECRET = previousAuthorSessionSecret;
  }
}

describe("author session JWT", () => {
  it("creates and verifies a signed author session token", () => {
    withAuthorSessionSecret("test-secret");

    const token = createAuthorSessionToken(7, "alice");
    const payload = verifyAuthorSessionToken(token);

    assert.equal(payload?.type, "author");
    assert.equal(payload?.authorId, 7);
    assert.equal(payload?.authorCode, "alice");

    restoreAuthorSessionSecret();
  });

  it("rejects a token with a changed signature", () => {
    withAuthorSessionSecret("test-secret");

    const token = createAuthorSessionToken(7, "alice");
    const tamperedToken = `${token.slice(0, -1)}x`;

    assert.equal(verifyAuthorSessionToken(tamperedToken), null);

    restoreAuthorSessionSecret();
  });

  it("rejects malformed tokens", () => {
    withAuthorSessionSecret("test-secret");

    assert.equal(verifyAuthorSessionToken("not-a-jwt"), null);

    restoreAuthorSessionSecret();
  });
});
