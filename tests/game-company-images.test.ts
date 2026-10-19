import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

// The service also imports server-only provider configuration; run this test with Next's server conditions.
test("company logos retain their complete shape and transparent padding", { skip: !process.env.NODE_PATH }, async () => {
  const { transformCompanyLogo, getExternalCompanyImageUrl } = await import("../src/lib/creators/game-company-images");
  const input = await sharp({ create: { width: 200, height: 50, channels: 4, background: { r: 230, g: 10, b: 10, alpha: 1 } } }).png().toBuffer();
  const output = await transformCompanyLogo(input);
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, info.height);
  assert.equal(data[3], 0, "top padding is transparent instead of cropping the wide logo");
  const center = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
  assert.equal(data[center + 3], 255);
  assert.ok(data[center] > 180);
  assert.equal(getExternalCompanyImageUrl("avatars/external-companies/igdb/company-7/" + "a".repeat(64) + ".webp"), "/company-images/igdb/company-7/" + "a".repeat(64) + ".webp");
  assert.equal(getExternalCompanyImageUrl("avatars/external-companies/../../secret"), null);
  await assert.rejects(transformCompanyLogo(Buffer.from("not an image")));
});
