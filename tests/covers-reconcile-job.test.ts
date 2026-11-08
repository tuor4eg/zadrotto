import './fixtures/server-runtime';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileCovers, coverReconcileHandler, type CoverReconcileJobDependencies } from '../src/lib/covers/reconcile-job';
import { parseCoverReconcilePayload, type CoverReconcileItem, type CoverReconcilePayload } from '../src/lib/covers/reconcile-model';
import type { ReconcileProcessResult } from '../src/lib/covers/reconcile-process';
import { JobError } from '../src/lib/jobs/types';

const guard = { runId: 8, lockToken: 'owner' };
const item = (id: number, kind: CoverReconcileItem['kind'] = 'media-item'): CoverReconcileItem => kind === 'media-item'
  ? { kind, id, mediaItemId: id, code: `record-${id}`, title: 'Example', originalTitle: null, mediaType: 'film', releaseYear: null, coverUrl: 'old.jpg', coverThumbUrl: 'old-thumb.webp', coverSourceProvider: null, coverSourceExternalId: null, coverSourcePageUrl: null, metadataSourceProvider: null, metadataSourceExternalId: null }
  : { kind, id, mediaItemId: 1, title: 'Part', mediaType: 'series', coverUrl: 'old.jpg', coverThumbUrl: null, posterSourceUrl: null, sourceProvider: null, externalId: null };
const findings = { missingOriginal: true, missingThumbnail: true, empty: false };
const own = 'covers/media-items/record-1-aaaaaaaa-bbb.jpg';
function harness(rows: CoverReconcileItem[], results: ReconcileProcessResult[]) {
  let saved: CoverReconcilePayload | undefined;
  let boundsCalls = 0;
  const processed: string[] = [], removed: string[] = [];
  const logs: Parameters<CoverReconcileJobDependencies['log']>[0][] = [];
  let referenceCalls = 0;
  let applied = true, referenced = false, referenceError = false, commitError: Error | undefined;
  const deps: CoverReconcileJobDependencies = {
    bounds: async () => { boundsCalls++; return { throughMediaItemId: 10, throughPartId: 20 }; },
    batch: async p => rows.filter(r => r.kind === (p.checkpoint!.phase === 'media-items' ? 'media-item' : 'title-part') && r.id > p.checkpoint!.afterId && r.id <= (r.kind === 'media-item' ? p.checkpoint!.throughMediaItemId : p.checkpoint!.throughPartId)).slice(0, p.batchSize + 1),
    checkpoint: async (_g, p) => { saved = structuredClone(p); },
    commit: async input => {
      assert.equal(input.guard, guard);
      input.signal.throwIfAborted();
      if (commitError) throw commitError;
      const p = input.payload(Boolean(input.update && applied)); saved = structuredClone(p);
      return { applied: Boolean(input.update && applied), payload: p };
    },
    process: async r => { processed.push(`${r.kind}:${r.id}`); return results.shift() ?? { status: 'healthy', code: 'healthy' }; },
    log: async input => { logs.push(input); },
    referenced: async () => { referenceCalls++; if (referenceError) throw new Error('DB unavailable'); return referenced; },
    remove: async input => { removed.push(input.objectKey); },
  };
  return { deps, processed, removed, logs, get referenceCalls() { return referenceCalls; }, get saved() { return saved!; }, get boundsCalls() { return boundsCalls; }, set applied(value: boolean) { applied = value; }, set referenced(value: boolean) { referenced = value; }, set referenceError(value: boolean) { referenceError = value; }, set commitError(value: Error | undefined) { commitError = value; } };
}
const run = (h: ReturnType<typeof harness>, p = parseCoverReconcilePayload({ batchSize: 10 }), signal = new AbortController().signal) => reconcileCovers(p, guard, signal, h.deps);
const deferred = (code: string) => (error: unknown) => error instanceof JobError && error.code === code && error.deferSeconds !== null;

test('fixed bounds and phase-specific PK cursors keep audit findings nonfatal', async () => {
  const h = harness([item(1), item(11), item(2, 'title-part')], [{ status: 'audit', code: 'missing', findings }, { status: 'skipped', code: 'source-missing' }]);
  const state = await run(h);
  assert.deepEqual(h.processed, ['media-item:1', 'title-part:2']);
  assert.equal(h.boundsCalls, 1); assert.equal(state.phase, 'title-parts');
  assert.equal(state.counters.checked, 2); assert.equal(state.counters.failed, 0);
  assert.equal(state.counters.missingOriginal, 1); assert.equal(state.counters.skipped, 1);
});

test('partial publication survives retry and findings/counters count the record once', async () => {
  const h = harness([item(1)], [{ status: 'retry', code: 'thumb-error', findings, objects: { coverUrl: own, coverThumbUrl: null }, update: { coverUrl: own, coverThumbUrl: null }, replacement: true, retryable: true }, { status: 'restored', code: 'thumbnail-restored', findings: { ...findings, missingOriginal: false }, update: { coverUrl: own, coverThumbUrl: 'new-thumb.webp' } }]);
  h.referenced = true;
  await assert.rejects(run(h), deferred('cover-record-retry'));
  assert.equal(h.saved.checkpoint!.counters.checked, 0);
  assert.equal(h.saved.checkpoint!.current!.restored, true);
  const state = await run(h, h.saved);
  assert.equal(h.boundsCalls, 1); assert.equal(state.counters.checked, 1);
  assert.equal(state.counters.missingOriginal, 1); assert.equal(state.counters.restored, 1); assert.equal(state.counters.replaced, 1);
  assert.deepEqual(h.removed, []);
  assert.equal(h.referenceCalls, 0);
});

test('quota defers indefinitely without spending the three record retries', async () => {
  const h = harness([item(1)], [{ status: 'retry', code: 'quota', deferSeconds: 90 }, { status: 'retry', code: 'quota', deferSeconds: 90 }]);
  await assert.rejects(run(h), deferred('cover-provider-deferred'));
  assert.equal(h.saved.checkpoint!.current!.retryCount, 0);
  await assert.rejects(run(h, h.saved), deferred('cover-provider-deferred'));
  assert.equal(h.saved.checkpoint!.current!.retryCount, 0); assert.equal(h.saved.checkpoint!.counters.failed, 0);
});

test('third transient error advances once and continues to later records', async () => {
  const h = harness([item(1), item(2)], Array.from({ length: 3 }, () => ({ status: 'retry' as const, code: 'download-timeout', findings, retryable: true })));
  await assert.rejects(run(h), deferred('cover-record-retry'));
  await assert.rejects(run(h, h.saved), deferred('cover-record-retry'));
  await assert.rejects(run(h, h.saved), (error: unknown) => error instanceof JobError && error.code === 'cover-reconcile-partial');
  const state = h.saved.checkpoint!;
  assert.equal(state.counters.checked, 2); assert.equal(state.counters.failed, 1); assert.equal(state.counters.healthy, 1);
  assert.deepEqual(state.errors, [{ kind: 'media-item', id: 1, code: 'download-timeout' }]);
});

test('CAS conflict discards only owned unpublished keys and records a skip', async () => {
  const h = harness([item(1)], [{ status: 'restored', code: 'restored', findings, objects: { coverUrl: own, coverThumbUrl: 'old-thumb.webp' }, update: { coverUrl: own, coverThumbUrl: null } }]);
  h.applied = false;
  const state = await run(h);
  assert.deepEqual(h.removed, [own]); assert.equal(state.counters.skipped, 1); assert.equal(state.counters.restored, 0);
});

test('fencing and unknown publication state retain uploads and never advance progress', async () => {
  const h = harness([item(1)], [{ status: 'restored', code: 'restored', objects: { coverUrl: own, coverThumbUrl: null }, update: { coverUrl: own, coverThumbUrl: null } }]);
  h.commitError = new JobError('lease-lost', 'Lease lost', { retryable: false }); h.referenceError = true;
  await assert.rejects(run(h), (error: unknown) => error instanceof JobError && error.code === 'lease-lost');
  assert.equal(h.saved.checkpoint!.afterId, 0); assert.deepEqual(h.removed, []);
});

test('cancellation after upload cleans unreferenced owned objects without publishing', async () => {
  const h = harness([item(1)], []); const controller = new AbortController();
  h.deps.process = async () => { controller.abort(new Error('stopped')); return { status: 'retry', code: 'cancelled', objects: { coverUrl: own, coverThumbUrl: null } }; };
  await assert.rejects(run(h, undefined, controller.signal), /stopped/);
  assert.deepEqual(h.removed, [own]); assert.equal(h.saved.checkpoint!.counters.checked, 0);
});

test('fatal S3 errors stop immediately and bounded batches resume from committed PK', async () => {
  const fatal = harness([item(1), item(2)], [{ status: 'retry', code: 'AccessDenied', fatal: true }]);
  await assert.rejects(run(fatal), (error: unknown) => error instanceof JobError && error.code === 'AccessDenied' && !error.retryable);
  assert.equal(fatal.processed.length, 1); assert.equal(fatal.saved.checkpoint!.current!.retryCount, 0);
  const h = harness([item(1), item(2)], []);
  await assert.rejects(run(h, parseCoverReconcilePayload({ batchSize: 1 })), deferred('cover-reconcile-continue'));
  assert.equal(h.saved.checkpoint!.afterId, 1); assert.equal(h.saved.checkpoint!.counters.checked, 1);
});


test('deleted in-progress record retains findings and finishes as skipped', async () => {
  const h = harness([item(1)], [{ status: 'retry', code: 'transient', findings, retryable: true }]);
  await assert.rejects(run(h), deferred('cover-record-retry'));
  h.deps.batch = async () => [];
  const state = await run(h, h.saved);
  assert.equal(state.counters.checked, 1); assert.equal(state.counters.skipped, 1);
  assert.equal(state.counters.missingOriginal, 1); assert.equal(state.current, undefined);
  assert.ok(h.logs.some(log => log.action === 'media.cover-reconcile.completed' && log.metadata?.runId === guard.runId));
});

test('scheduled invocations are rejected before any network or checkpoint work', async () => {
  await assert.rejects(coverReconcileHandler.execute({ payload: parseCoverReconcilePayload({}), runId: 1, lockToken: 'owner', jobId: 3, attempt: 1, source: 'manual', signal: new AbortController().signal }),
    (error: unknown) => error instanceof JobError && error.code === 'manual-only');
  assert.equal(coverReconcileHandler.schedulable, false);
});


test('a full final batch completes without an unnecessary continuation', async () => {
  const h = harness([item(1)], []);
  const state = await run(h, parseCoverReconcilePayload({ batchSize: 1, includeParts: false }));
  assert.equal(state.counters.checked, 1);
  assert.ok(h.logs.some(log => log.action === 'media.cover-reconcile.completed'));
});
