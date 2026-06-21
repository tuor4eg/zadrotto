import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { createAdminSessionToken, verifyAdminSessionToken } from "../src/lib/auth/admin-session";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";

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

function createLegacyAdminSessionToken(input: {
  adminId: number;
  sessionUpdatedAt: number;
  secret: string;
}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      type: "admin",
      adminId: input.adminId,
      sessionUpdatedAt: input.sessionUpdatedAt,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
  ).toString("base64url");
  const content = `${header}.${payload}`;
  const signature = createHmac("sha256", input.secret).update(content).digest("base64url");

  return `${content}.${signature}`;
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

    const token = createAdminSessionToken(42, 123456789);
    const payload = verifyAdminSessionToken(token);

    assert.equal(payload?.type, "admin");
    assert.equal(payload?.adminId, 42);
    assert.equal(payload?.sessionInvalidatedAt, 123456789);

    restoreAdminSessionSecret();
  });

  it("rejects a token with a changed signature", () => {
    withAdminSessionSecret("test-secret");

    const token = createAdminSessionToken(42, 123456789);
    const tamperedToken = `${token.slice(0, -1)}x`;

    assert.equal(verifyAdminSessionToken(tamperedToken), null);

    restoreAdminSessionSecret();
  });

  it("accepts the previous sessionUpdatedAt payload field", () => {
    withAdminSessionSecret("test-secret");

    const token = createLegacyAdminSessionToken({
      adminId: 42,
      sessionUpdatedAt: 123456789,
      secret: "test-secret",
    });
    const payload = verifyAdminSessionToken(token);

    assert.equal(payload?.sessionInvalidatedAt, 123456789);

    restoreAdminSessionSecret();
  });

  it("rejects malformed tokens", () => {
    withAdminSessionSecret("test-secret");

    assert.equal(verifyAdminSessionToken("not-a-jwt"), null);

    restoreAdminSessionSecret();
  });
});
