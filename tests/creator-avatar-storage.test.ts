import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { AVATAR_MAX_BYTES } from "../src/lib/avatars/config";
import { isCreatorAvatarObjectKey, transformCreatorAvatarBuffer } from "../src/lib/creators/avatar-storage";
import { resolveCreatorAvatarUrl } from "../src/lib/creators/avatar-url";

describe("creator avatar storage", () => {
  it("scopes avatar URLs to creator objects", () => {
    const key = "avatars/creators/42/550e8400-e29b-41d4-a716-446655440000.webp";
    assert.equal(isCreatorAvatarObjectKey(key), true);
    assert.equal(resolveCreatorAvatarUrl(key), "/creator-avatars/42/550e8400-e29b-41d4-a716-446655440000.webp");
    for (const invalid of [null, "avatars/creators/42/../../secret.webp", key.replace("creators", "authors"), key.replace("/42/", "/0/")]) {
      assert.equal(isCreatorAvatarObjectKey(invalid), false);
      assert.equal(resolveCreatorAvatarUrl(invalid), null);
    }
  });

  it("normalizes a rectangular source to deterministic square WebP", async () => {
    const source = await sharp({ create: { width: 32, height: 64, channels: 3, background: "red" } }).png().toBuffer();
    const body = await transformCreatorAvatarBuffer(source);
    const metadata = await sharp(body).metadata();
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 512);
    assert.equal(metadata.format, "webp");
    assert.deepEqual(await transformCreatorAvatarBuffer(source), body);
  });

  it("rejects empty, oversized, invalid and unsupported images", async () => {
    for (const invalid of [Buffer.alloc(0), Buffer.alloc(AVATAR_MAX_BYTES + 1), Buffer.from("invalid"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')]) {
      await assert.rejects(transformCreatorAvatarBuffer(invalid));
    }
  });
});
