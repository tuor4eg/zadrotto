import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateAuthorAccessToken,
  hashAuthorAccessToken,
} from "../src/lib/author-access-token";
import {
  canAssignAuthorAccessProfile,
  isAuthorAccessProfileCode,
} from "../src/lib/author-access-profiles";

describe("author access tokens", () => {
  it("generates opaque access tokens with a stable prefix", () => {
    const token = generateAuthorAccessToken();

    assert.equal(token.startsWith("zat_"), true);
    assert.equal(token.length > 40, true);
  });

  it("hashes access tokens without preserving the original token", () => {
    const token = "zat_test-token";
    const tokenHash = hashAuthorAccessToken(token);

    assert.equal(tokenHash.length, 64);
    assert.equal(tokenHash.includes(token), false);
    assert.equal(hashAuthorAccessToken(token), tokenHash);
  });

  it("generates different tokens on each call", () => {
    assert.notEqual(generateAuthorAccessToken(), generateAuthorAccessToken());
  });
});

describe("author access profiles", () => {
  it("keeps known profile codes explicit", () => {
    assert.equal(isAuthorAccessProfileCode("regular"), true);
    assert.equal(isAuthorAccessProfileCode("trusted"), true);
    assert.equal(isAuthorAccessProfileCode("unknown"), false);
  });

  it("allows assigning profiles only to real authors", () => {
    assert.equal(canAssignAuthorAccessProfile({ isSystem: false }), true);
    assert.equal(canAssignAuthorAccessProfile({ isSystem: true }), false);
  });
});
