import assert from 'node:assert/strict';
import test from 'node:test';
import { tierExportDimensions } from '../src/lib/tier-lists/export';
import { clearTierDraftIfSnapshot, readTierDraft, replaceTierDraft, writeTierDraft, tierRecoveryKey, newTierRecoveryKey, readTierRecovery, writeTierRecovery, removeTierRecovery } from '../src/lib/tier-lists/storage';
import { DEFAULT_TIER_CONFIGURATION, emptyTierDistribution, type TierLocalDraft } from '../src/lib/tier-lists/model';

test('export uniformly scales within canvas and pixel limits', () => {
  for (const [width, height] of [[1200, 40000], [12000, 12000], [100, 100]]) {
    const size = tierExportDimensions(width, height);
    assert.ok(size.width <= 8192 && size.height <= 8192);
    assert.ok(size.width * size.height <= 16000000);
    assert.ok(Math.abs(size.width / width - size.height / height) <= 1 / Math.min(width, height));
  }
});
test('storage rejects malformed and unknown versions and preserves a changed snapshot', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent() {} } });
  const draft: TierLocalDraft = { schemaVersion: 1, snapshotToken: 'a'.repeat(64), clientCreationId: '00000000-0000-4000-8000-000000000001', title: '', templateId: 1, configuration: DEFAULT_TIER_CONFIGURATION, distribution: emptyTierDistribution(DEFAULT_TIER_CONFIGURATION), updatedAt: new Date().toISOString() };
  assert.equal(writeTierDraft(draft, null), true);
  assert.deepEqual(readTierDraft(), draft);
  const snapshot = JSON.stringify(draft);
  assert.equal(writeTierDraft({ ...draft, title: 'Изменено' }, snapshot), true);
  assert.equal(clearTierDraftIfSnapshot(snapshot), false);
  assert.equal(writeTierDraft(draft, snapshot), false);
  for (const value of values.keys()) values.set(value, '{malformed');
  assert.equal(readTierDraft(), null);
  for (const value of values.keys()) values.set(value, JSON.stringify({ ...draft, schemaVersion: 2 }));
  assert.equal(readTierDraft(), null);
  const unknown = values.get('geekoteka.tier-list.v1');
  assert.equal(writeTierDraft(draft), false);
  assert.equal(values.get('geekoteka.tier-list.v1'), unknown);
  assert.equal(replaceTierDraft(draft), true);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
  assert.equal(readTierDraft(), null);
  assert.equal(writeTierDraft(draft), false);
});

test('authorized recovery is session scoped, versioned and separated by author/document', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  const draft: TierLocalDraft = { schemaVersion: 1, snapshotToken: 'a'.repeat(64), clientCreationId: '00000000-0000-4000-8000-000000000001', title: 'Recovery', templateId: 1, configuration: DEFAULT_TIER_CONFIGURATION, distribution: emptyTierDistribution(DEFAULT_TIER_CONFIGURATION), updatedAt: new Date().toISOString() };
  const key = tierRecoveryKey(10, 'one');
  assert.notEqual(key, tierRecoveryKey(11, 'one'));
  assert.notEqual(key, tierRecoveryKey(10, 'two'));
  assert.equal(writeTierRecovery(key, { schemaVersion: 1, baseVersion: 4, draft }), true);
  assert.deepEqual(readTierRecovery(key), { schemaVersion: 1, baseVersion: 4, draft });
  assert.equal(readTierRecovery(tierRecoveryKey(11, 'one')), null);
  const pendingKey = newTierRecoveryKey(draft.clientCreationId);
  assert.equal(newTierRecoveryKey(), pendingKey);
  removeTierRecovery(key);
  assert.equal(readTierRecovery(key), null);
  values.set(key, JSON.stringify({ schemaVersion: 2, baseVersion: 4, draft }));
  assert.equal(readTierRecovery(key), null);
  values.set(key, JSON.stringify({ schemaVersion: 1, baseVersion: -1, draft }));
  assert.equal(readTierRecovery(key), null);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('denied'); } });
  assert.equal(readTierRecovery(key), null);
  assert.equal(writeTierRecovery(key, { schemaVersion: 1, baseVersion: 4, draft }), false);
});
