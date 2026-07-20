import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTHOR_PASSWORD_MAX_LENGTH,
  AUTHOR_PASSWORD_MIN_LENGTH,
  normalizeAuthorEmail,
  normalizeAuthorLogin,
  validateAuthorPassword,
} from "@/lib/auth/author-account";
import {
  generateAuthorSessionToken,
  hashAuthorSessionToken,
} from "@/lib/auth/author-session";
import {
  decryptEmailOutboxPayload,
  encryptEmailOutboxPayload,
} from "@/lib/auth/email-outbox-crypto";
import {
  generateAuthorAuthChallengeToken,
  hashAuthorAuthChallengeToken,
} from "@/lib/auth/challenges";
import { hashPassword, verifyPasswordOrDummy } from "@/lib/auth/password";
import { getPasswordStrength } from "@/lib/auth/password-strength";

describe("author auth core", () => {
  it("normalizes logins and emails consistently", () => {
    assert.equal(normalizeAuthorLogin("  ИВАН  "), "иван");
    assert.equal(normalizeAuthorEmail(" User@Example.COM "), "user@example.com");
  });

  it("enforces the author password length policy", () => {
    assert.deepEqual(validateAuthorPassword("x".repeat(AUTHOR_PASSWORD_MIN_LENGTH - 1)), {
      ok: false,
      error: "too-short",
    });
    assert.deepEqual(validateAuthorPassword("x".repeat(AUTHOR_PASSWORD_MIN_LENGTH)), { ok: true });
    assert.deepEqual(validateAuthorPassword("x".repeat(AUTHOR_PASSWORD_MAX_LENGTH + 1)), {
      ok: false,
      error: "too-long",
    });
  });

  it("accepts both password policy boundaries", () => {
    assert.equal(AUTHOR_PASSWORD_MIN_LENGTH, 8);
    assert.deepEqual(validateAuthorPassword("x".repeat(AUTHOR_PASSWORD_MIN_LENGTH)), { ok: true });
    assert.deepEqual(validateAuthorPassword("x".repeat(AUTHOR_PASSWORD_MAX_LENGTH)), { ok: true });
    assert.deepEqual(validateAuthorPassword("abcdefgh"), { ok: true });
    assert.deepEqual(validateAuthorPassword("12345678"), { ok: true });
  });

  it("scores password strength for display without changing validation", () => {
    assert.equal(getPasswordStrength(""), null);
    assert.deepEqual(getPasswordStrength("aaaaaaaa"), {
      level: "weak",
      label: "Простой",
      score: 1,
    });
    assert.equal(getPasswordStrength("Longer-Cedar-42!")?.label, "Сильный");
  });

  it("normalizes compatibility-equivalent credentials", () => {
    assert.equal(normalizeAuthorLogin(" ＵＳＥＲ "), "user");
    assert.equal(normalizeAuthorEmail(" ＵＳＥＲ@ＥＸＡＭＰＬＥ.ＣＯＭ "), "user@example.com");
  });

  it("creates opaque session tokens and stores stable hashes", () => {
    const token = generateAuthorSessionToken();

    assert.match(token, /^zas_/);
    assert.equal(token.split(".").length, 1);
    assert.equal(hashAuthorSessionToken(token), hashAuthorSessionToken(token));
    assert.notEqual(hashAuthorSessionToken(token), token);
  });

  it("creates opaque single-purpose challenge secrets", () => {
    const first = generateAuthorAuthChallengeToken();
    const second = generateAuthorAuthChallengeToken();

    assert.match(first, /^zac_[A-Za-z0-9_-]+$/);
    assert.notEqual(first, second);
    assert.match(hashAuthorAuthChallengeToken(first), /^[a-f0-9]{64}$/);
    assert.notEqual(hashAuthorAuthChallengeToken(first), first);
  });

  it("uses the same password verification path for missing accounts", async () => {
    const hash = await hashPassword("correct horse battery staple");

    assert.equal(await verifyPasswordOrDummy("correct horse battery staple", hash), true);
    assert.equal(await verifyPasswordOrDummy("wrong password", hash), false);
    assert.equal(await verifyPasswordOrDummy("wrong password", null), false);
  });

  it("encrypts provider-neutral outbox payloads", () => {
    const previousKey = process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
    process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = "test-email-outbox-key";

    try {
      const encrypted = encryptEmailOutboxPayload({ challenge: "secret", authorId: 42 });

      assert.equal(encrypted.includes("secret"), false);
      assert.deepEqual(decryptEmailOutboxPayload(encrypted), {
        challenge: "secret",
        authorId: 42,
      });
    } finally {
      if (previousKey === undefined) {
        delete process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
      } else {
        process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = previousKey;
      }
    }
  });

  it("rejects tampered outbox payloads", () => {
    const previousKey = process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
    process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = "test-email-outbox-key";

    try {
      const encrypted = encryptEmailOutboxPayload({ challenge: "secret" });
      const [version, iv, authTag, ciphertext] = encrypted.split(".");
      const tamperedAuthTag = `${authTag?.startsWith("a") ? "b" : "a"}${authTag?.slice(1)}`;
      const tampered = [version, iv, tamperedAuthTag, ciphertext].join(".");

      assert.throws(() => decryptEmailOutboxPayload(tampered));
      assert.throws(() => decryptEmailOutboxPayload("v0.invalid.payload"));
    } finally {
      if (previousKey === undefined) delete process.env.EMAIL_OUTBOX_ENCRYPTION_KEY;
      else process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = previousKey;
    }
  });
});
