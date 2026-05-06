import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAdminSessionToken, verifyAdminSessionToken } from "../src/lib/admin-session";
import { hashPassword, verifyPassword } from "../src/lib/password";

const previousAdminSessionSecret = process.env.ADMIN_SESSION_SECRET;

function withAdminSessionSecret(secret: string) {
  process.env.ADMIN_SESSION_SECRET = secret;
}

function restoreAdminSessionSecret() {
  if (previousAdminSessionSecret === undefined) {
    delete process.env.ADMIN_SESSION_SECRET;
  } else {
    process.env.ADMIN_SESSION_SECRET = previousAdminSessionSecret;
  }
}

describe("password hashing", () => {
  it("verifies the original password and rejects another one", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    assert.equal(await verifyPassword("correct horse battery staple", passwordHash), true);
    assert.equal(await verifyPassword("wrong password", passwordHash), false);
  });

  it("does not store the plain password in the hash", async () => {
    const passwordHash = await hashPassword("admin-password");

    assert.equal(passwordHash.includes("admin-password"), false);
  });
});

describe("admin session JWT", () => {
  it("creates and verifies a signed admin session token", () => {
    withAdminSessionSecret("test-secret");

    const token = createAdminSessionToken(42);
    const payload = verifyAdminSessionToken(token);

    assert.equal(payload?.type, "admin");
    assert.equal(payload?.adminId, 42);

    restoreAdminSessionSecret();
  });

  it("rejects a token with a changed signature", () => {
    withAdminSessionSecret("test-secret");

    const token = createAdminSessionToken(42);
    const tamperedToken = `${token.slice(0, -1)}x`;

    assert.equal(verifyAdminSessionToken(tamperedToken), null);

    restoreAdminSessionSecret();
  });

  it("rejects malformed tokens", () => {
    withAdminSessionSecret("test-secret");

    assert.equal(verifyAdminSessionToken("not-a-jwt"), null);

    restoreAdminSessionSecret();
  });
});
