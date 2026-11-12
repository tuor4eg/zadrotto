import './fixtures/server-runtime';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { isTierPreviewKey, resolveTierPreviewUrl, tierPreviewListId, TIER_PREVIEW_CLEANUP, TIER_PREVIEW_GENERATE } from '../src/lib/tier-lists/preview';

test('preview paths accept only dedicated keys and bounded list IDs', () => {
  const key = `tier-lists/previews/12/${randomUUID()}.webp`;
  assert.equal(isTierPreviewKey(key), true);
  assert.equal(tierPreviewListId(key), 12);
  assert.equal(resolveTierPreviewUrl(key), `/tier-list-previews/${key}`);
  for (const invalid of ['collections/file.webp', 'tier-lists/previews/12/../../file.webp', '', null]) {
    assert.equal(isTierPreviewKey(invalid), false);
    assert.equal(resolveTierPreviewUrl(invalid), null);
  }
  assert.equal(tierPreviewListId(`tier-lists/previews/2147483648/${randomUUID()}.webp`), null);
});

test('preview handlers are internal ad-hoc jobs with strict payloads', async () => {
  const { jobHandlerRegistry } = await import('../src/lib/jobs/handlers');
  const generate = jobHandlerRegistry.get(TIER_PREVIEW_GENERATE);
  const cleanup = jobHandlerRegistry.get(TIER_PREVIEW_CLEANUP);
  for (const handler of [generate, cleanup]) {
    assert.equal(handler.schedulable, false);
    assert.equal(handler.manualPlacement, 'none');
  }
  assert.deepEqual(generate.parsePayload({ listId: 12, version: 2 }), { listId: 12, version: 2 });
  for (const payload of [{}, { listId: 0, version: 1 }, { listId: 1, version: 0 }, { listId: 1, version: 1, authorId: 3 }]) assert.throws(() => generate.parsePayload(payload));
  assert.throws(() => cleanup.parsePayload({ objectKey: 'collections/unrelated.webp' }));
});
