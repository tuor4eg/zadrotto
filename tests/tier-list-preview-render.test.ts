import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

import { renderTierListPreview } from "../src/lib/tier-lists/preview-render";

async function pixels(buffer: Buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
}

test("empty preview is a fixed WebP canvas with the requested background", async () => {
  const result = await renderTierListPreview({ backgroundColor: "#123456", rows: [] });
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 128);
  assert.equal(metadata.height, 192);
  const pixel = await pixels(result);
  assert.deepEqual(pixel(0, 0), [18, 52, 86]);
  assert.deepEqual(pixel(127, 191), [18, 52, 86]);
});

test("tier stripes preserve colors and invalid covers become placeholders independently", async () => {
  const green = await sharp({ create: { width: 22, height: 33, channels: 3, background: "#00ff00" } }).png().toBuffer();
  const result = await renderTierListPreview({
    backgroundColor: "#000000",
    rows: [
      { color: "#ff0000", posters: [Buffer.from("invalid image"), green, null] },
      { color: "#0000ff", posters: [] },
    ],
  });
  const pixel = await pixels(result);
  assert.deepEqual(pixel(10, 10), [255, 0, 0]);
  assert.deepEqual(pixel(10, 105), [0, 0, 255]);
  assert.deepEqual(pixel(25, 10), [55, 65, 81]);
  assert.deepEqual(pixel(50, 10), [0, 255, 0]);
  assert.deepEqual(pixel(75, 10), [55, 65, 81]);
});

test("large and wide sources and long lists never change output geometry", async () => {
  const wide = await sharp({ create: { width: 2000, height: 10, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const rows = Array.from({ length: 12 }, (_, index) => ({ color: index === 11 ? "#ff00ff" : "#00ff00", posters: [wide, wide, wide, wide, wide] }));
  const result = await renderTierListPreview({ backgroundColor: "#000000", rows });
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.width, 128);
  assert.equal(metadata.height, 192);
  const pixel = await pixels(result);
  assert.deepEqual(pixel(10, 170), [255, 0, 255]);
  assert.deepEqual(pixel(127, 191), [0, 0, 0]);
});
