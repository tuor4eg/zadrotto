import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCollectionSettings } from "../src/lib/editorial-documents/settings";
import { assertEditorialDocumentBlocks, parseEditorialDocumentBlocks, type EditorialDocumentBlockInput } from "../src/lib/editorial-documents/model";

test("collection settings accept positive Postgres integers and reject missing or malformed values", () => {
  assert.deepEqual(parseCollectionSettings({ maxBlocks: "450", maxEntries: "250" }), { maxBlocks: 450, maxEntries: 250 });
  for (const value of [null, undefined, "", " ", 0, -1, 1.5, "abc", Infinity, 2_147_483_648, true]) {
    assert.equal(parseCollectionSettings({ maxBlocks: value, maxEntries: 200 }), null);
    assert.equal(parseCollectionSettings({ maxBlocks: 300, maxEntries: value }), null);
  }
});

test("configured limits apply to parsing and combined single/group members, above and below old defaults", () => {
  const entries = Array.from({ length: 201 }, (_, i) => i + 1);
  const blocks: EditorialDocumentBlockInput[] = [
    { type: "media", mediaItemId: 202, editorialComment: null },
    { type: "entry_group", title: null, description: null, mediaItemIds: entries },
  ];
  const limits = { maxBlocks: 2, maxEntries: 202 };
  assert.deepEqual(parseEditorialDocumentBlocks(JSON.stringify(blocks), limits), blocks);
  assert.throws(() => assertEditorialDocumentBlocks(blocks, { ...limits, maxEntries: 201 }), /media-blocks-limit:201/);
  assert.throws(() => parseEditorialDocumentBlocks(JSON.stringify(blocks), { ...limits, maxBlocks: 1 }), /blocks-limit:1/);
  const textBlocks: EditorialDocumentBlockInput[] = Array.from({ length: 301 }, () => ({ type: "text", content: "Текст" }));
  assert.doesNotThrow(() => assertEditorialDocumentBlocks(textBlocks, { maxBlocks: 301, maxEntries: 1 }));
});
