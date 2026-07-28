import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import sharp from "sharp";

import {
  buildAuthorAvatarObjectKey,
  isAuthorAvatarObjectKey,
  parseAvatarCrop,
  transformAuthorAvatar,
} from "../src/lib/avatars/storage";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const storage = read("src/lib/avatars/storage.ts");
const avatarRoute = read("src/app/avatars/[...objectKey]/route.ts");
const profileActions = read("src/app/author/(protected)/profile/actions.ts");
const avatarEditor = read("src/app/author/(protected)/profile/avatar-editor.tsx");
const avatar = read("src/components/ui/avatar.tsx");

describe("author avatars", () => {
  it("accepts only finite integer crop rectangles with positive dimensions", () => {
    assert.deepEqual(
      parseAvatarCrop({ x: "0", y: "12", width: "320", height: "320" }),
      { x: 0, y: 12, width: 320, height: 320 },
    );

    for (const input of [
      { x: null, y: "0", width: "1", height: "1" },
      { x: "-1", y: "0", width: "1", height: "1" },
      { x: "0.5", y: "0", width: "1", height: "1" },
      { x: "0", y: "0", width: "0", height: "1" },
      { x: "0", y: "0", width: "1", height: "Infinity" },
    ]) {
      assert.equal(parseAvatarCrop(input), null);
    }
  });

  it("builds scoped WebP keys and rejects malformed or unsafe keys", () => {
    const objectKey = buildAuthorAvatarObjectKey(42);
    assert.match(
      objectKey,
      /^avatars\/authors\/42\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/,
    );
    assert.equal(isAuthorAvatarObjectKey(objectKey), true);

    for (const unsafeKey of [
      "avatars/authors/42/../../secret.webp",
      "avatars/authors/0/550e8400-e29b-41d4-a716-446655440000.webp",
      "avatars/authors/42/not-a-uuid.webp",
      `avatars/authors/42/${"-".repeat(36)}.webp`,
      "covers/authors/42/550e8400-e29b-41d4-a716-446655440000.webp",
    ]) {
      assert.equal(isAuthorAvatarObjectKey(unsafeKey), false);
    }
  });

  it("keeps file validation and image transformation on the server", () => {
    assert.match(storage, /AVATAR_MAX_BYTES = 5 \* 1024 \* 1024|AVATAR_MAX_BYTES/);
    assert.match(storage, /AVATAR_IMAGE_TYPES[\s\S]*input\.file\.type/);
    assert.match(storage, /animated: false/);
    assert.match(storage, /limitInputPixels: AVATAR_MAX_INPUT_PIXELS/);
    assert.match(storage, /pages: 1/);
    assert.match(storage, /\.rotate\(\)/);
    assert.match(storage, /\.extract\(\{ left: x, top: y, width, height \}\)/);
    assert.match(storage, /\.resize\(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE/);
    assert.match(storage, /\.webp\(/);
    assert.match(storage, /contentType: "image\/webp"/);
  });

  it("transforms regular and EXIF-oriented crops into 512px WebP images", async () => {
    const regularSource = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: { r: 230, g: 20, b: 10 },
      },
    }).png().toBuffer();
    const regular = await transformAuthorAvatar({
      file: new File([new Uint8Array(regularSource)], "avatar.png", { type: "image/png" }),
      crop: { x: 0, y: 0, width: 4, height: 4 },
    });

    assert.equal(regular.ok, true);
    if (!regular.ok) return;

    const regularImage = sharp(regular.body);
    const regularMetadata = await regularImage.metadata();
    const regularStats = await regularImage.stats();
    assert.equal(regularMetadata.width, 512);
    assert.equal(regularMetadata.height, 512);
    assert.equal(regularMetadata.format, "webp");
    assert.ok(regularStats.channels[0].mean > regularStats.channels[1].mean * 5);

    for (const orientation of [6, 8]) {
      const orientedSource = await sharp({
        create: {
          width: 4,
          height: 2,
          channels: 3,
          background: { r: 20, g: 120, b: 220 },
        },
      })
        .jpeg()
        .withMetadata({ orientation })
        .toBuffer();
      const oriented = await transformAuthorAvatar({
        file: new File(
          [new Uint8Array(orientedSource)],
          `oriented-${orientation}.jpg`,
          { type: "image/jpeg" },
        ),
        // This rectangle fits only after orientation 6/8 swaps 4×2 to 2×4.
        crop: { x: 0, y: 2, width: 2, height: 2 },
      });

      assert.equal(oriented.ok, true, `orientation ${orientation} must use rotated bounds`);
      if (!oriented.ok) continue;
      const metadata = await sharp(oriented.body).metadata();
      assert.equal(metadata.width, 512);
      assert.equal(metadata.height, 512);
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.orientation, undefined);
    }
  });

  it("derives avatar ownership only from the authenticated author", () => {
    assert.match(profileActions, /const current = await getCurrentAuthorSession\(\)/);
    assert.match(
      profileActions,
      /uploadAuthorAvatar\(\{[\s\S]*authorId: current\.author\.id,[\s\S]*file,[\s\S]*crop/,
    );
    assert.match(
      profileActions,
      /replaceAuthorAvatarObjectKey\(\{[\s\S]*authorId: current\.author\.id,[\s\S]*objectKey:/,
    );
    assert.doesNotMatch(profileActions, /formData\.get\("authorId"\)/);
    assert.match(profileActions, /action: "author\.avatar\.updated"/);
    assert.match(profileActions, /action: "author\.avatar\.removed"/);
  });

  it("serves only safe avatar keys that are currently assigned", () => {
    assert.match(avatarRoute, /\["avatars", \.\.\.segments\]\.join\("\/"\)/);
    assert.match(
      avatarRoute,
      /!isAuthorAvatarObjectKey\(objectKey\) \|\| !\(await isAssignedAuthorAvatarObjectKey\(objectKey\)\)/,
    );
    assert.match(avatarRoute, /status: 404/);
    assert.match(avatarRoute, /fetchS3Object\(\{ objectKey \}\)/);
    assert.match(avatarRoute, /"Content-Type": "image\/webp"/);
    assert.match(avatarRoute, /"X-Content-Type-Options": "nosniff"/);
  });

  it("uses a client cropper while submitting crop coordinates to the server", () => {
    assert.match(avatarEditor, /"use client"/);
    assert.match(avatarEditor, /from "react-easy-crop"/);
    assert.match(avatarEditor, /aspect=\{1\}/);
    assert.match(avatarEditor, /zoom=\{zoom\}/);
    assert.match(avatarEditor, /type="range"/);
    for (const field of ["cropX", "cropY", "cropWidth", "cropHeight"]) {
      assert.match(avatarEditor, new RegExp(`type="hidden" name="${field}"`));
    }
    assert.doesNotMatch(avatarEditor, /canvas|toBlob|convertToBlob/);
  });

  it("renders the shared avatar with initials fallback on every agreed surface", () => {
    assert.match(avatar, /objectKey \?[\s\S]*<img[\s\S]*getInitials\(name\)/);

    for (const path of [
      "src/app/author/(protected)/profile/page.tsx",
      "src/app/author/(protected)/layout.tsx",
      "src/app/media-item-reviews.tsx",
      "src/app/admin/(protected)/authors/page.tsx",
      "src/app/admin/(protected)/authors/[id]/page.tsx",
    ]) {
      const surface = read(path);
      assert.match(surface, /<Avatar/);
      assert.match(surface, /(?:avatarObjectKey|authorAvatarObjectKey)/);
    }

    const adminDetail = read("src/app/admin/(protected)/authors/[id]/page.tsx");
    const adminActions = read("src/app/admin/(protected)/authors/actions.ts");
    assert.match(adminDetail, /removeAuthorAvatarAdminAction/);
    assert.match(adminActions, /requireAdminUser\(\)[\s\S]*replaceAuthorAvatarObjectKey\(\{ authorId, objectKey: null \}\)/);
  });
});
