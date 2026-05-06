import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateAuthorAccessToken,
  hashAuthorAccessToken,
} from "../src/lib/author-access-token";
import { isAuthorPermission } from "../src/lib/author-permissions";

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

describe("author permissions", () => {
  it("keeps known author permissions explicit", () => {
    assert.equal(isAuthorPermission("publish_media_without_review"), true);
    assert.equal(isAuthorPermission("unknown"), false);
  });
});
