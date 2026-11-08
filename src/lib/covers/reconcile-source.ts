import { CoverRecoveryError, type CoverReconcileMediaItem, type CoverRecoveryResolution } from './reconcile-model';
import { type CoverSearchOptions, type MediaProvider } from './types';
import { getCoverProvidersForMediaType, type CoverProviderRuntimeSetting } from './registry';
import { coverProviderRequiresCredentials } from './credential-definitions';
import { runWithProviderRequestTimeout } from './provider-request-timeout';
import { isMediaTypeCode } from '@/lib/media/types';

type SavedSource = { externalId: string; imageUrl?: string; specificImage?: boolean };
/** Candidate IDs are not metadata IDs. Only recognized formats may recover a work binding. */
export function parseSavedCoverSource(provider: string, id: string): SavedSource | null {
  let m: RegExpMatchArray | null;
  if (provider === 'tmdb' && (m = id.match(/^(movie|tv):([1-9]\d*)(?::(\/[A-Za-z0-9_.-]+))?$/))) return { externalId: m[2], ...(m[3] ? { imageUrl: `https://image.tmdb.org/t/p/original${m[3]}`, specificImage: true } : {}) };
  if (provider === 'igdb' && (m = id.match(/^game:([1-9]\d*)(?::([A-Za-z0-9_-]+))?$/))) return { externalId: m[1], ...(m[2] ? { imageUrl: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${m[2]}.jpg`, specificImage: true } : {}) };
  if (provider === 'open-library' && (m = id.match(/^work:(\/works\/OL[1-9]\d*W)(?::([1-9]\d*))?$/))) return { externalId: m[1], ...(m[2] ? { imageUrl: `https://covers.openlibrary.org/b/id/${m[2]}-L.jpg`, specificImage: true } : {}) };
  const patterns: Record<string, RegExp> = {
    rawg: /^game:([1-9]\d*)$/, jikan: /^anime:([1-9]\d*)$/, anilist: /^anime:([1-9]\d*)$/,
    'google-books': /^volume:([A-Za-z0-9_-]+)$/, 'comic-vine': /^volume:([1-9]\d*)$/,
    mangaupdates: /^series:([1-9]\d*)$/, bgg: /^([1-9]\d*)$/, fantlab: /^work:([1-9]\d*)$/,
    roblox: /^universe:([1-9]\d*)(?::(?:icon:[A-Za-z0-9_-]+|thumbnail:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+))?$/,
  };
  m = id.match(patterns[provider] ?? /(?!) /);
  return m ? { externalId: m[1], ...(provider === 'roblox' && id.split(':').length > 2 ? { specificImage: true } : {}) } : null;
}

type RecoveryRuntime = { providers: readonly MediaProvider[]; settings: readonly CoverProviderRuntimeSetting[]; options: CoverSearchOptions };
export type CoverRecoveryOptions = { allowReplacement: boolean; includeEmpty: boolean; forceReplacement?: boolean; signal: AbortSignal };
export function createCoverRecoveryResolver(loadRuntime: () => Promise<RecoveryRuntime>) {
  return async function resolve(item: CoverReconcileMediaItem, policy: CoverRecoveryOptions): Promise<CoverRecoveryResolution> {
    policy.signal.throwIfAborted();
    if (!item.coverUrl && !policy.includeEmpty) return { kind: 'skip', code: 'empty-disabled' };
    if (policy.forceReplacement && !policy.allowReplacement) return { kind: 'skip', code: 'replacement-disabled' };
    if (!isMediaTypeCode(item.mediaType)) return { kind: 'skip', code: 'unsupported-media-type' };
    const runtime = await loadRuntime();
    policy.signal.throwIfAborted();
    const providers = getCoverProvidersForMediaType(item.mediaType, runtime.providers, runtime.settings);
    const savedProvider = item.coverSourceProvider;
    const saved = savedProvider && item.coverSourceExternalId ? parseSavedCoverSource(savedProvider, item.coverSourceExternalId) : null;
    const attempts: { provider: string; source: SavedSource; saved: boolean }[] = [];
    if (savedProvider === 'tmdb' && item.coverSourceExternalId && ((item.mediaType === 'film' && !item.coverSourceExternalId.startsWith('movie:')) || (item.mediaType === 'series' && !item.coverSourceExternalId.startsWith('tv:')))) return { kind: 'skip', code: 'source-media-type-mismatch' };
    if (saved && savedProvider) attempts.push({ provider: savedProvider, source: saved, saved: true });
    if (((!item.coverUrl && !item.coverSourceProvider && !item.coverSourceExternalId) || policy.allowReplacement) && item.metadataSourceProvider && item.metadataSourceExternalId) {
      if (!saved || savedProvider !== item.metadataSourceProvider || saved.externalId !== item.metadataSourceExternalId) attempts.push({ provider: item.metadataSourceProvider, source: { externalId: item.metadataSourceExternalId }, saved: false });
    }
    for (const attempt of attempts) {
      const provider = providers.find(p => p.code === attempt.provider);
      if (!provider) continue;
      const exact = attempt.saved && attempt.source.imageUrl && !policy.forceReplacement;
      if (exact) return { kind: 'candidate', exactImage: true, replacement: false, candidate: { id: item.coverSourceExternalId!, provider: provider.code, title: item.title, imageUrl: attempt.source.imageUrl!, sourcePageUrl: item.coverSourcePageUrl } };
      if (attempt.source.specificImage && !policy.allowReplacement) continue;
      if (!provider.getCoverCandidatesByTitleSource || (coverProviderRequiresCredentials(provider.code) && !runtime.options.providerCredentials?.[provider.code])) continue;
      try {
        policy.signal.throwIfAborted();
        // MangaUpdates reserves at the HTTP boundary, like the shared registry exact path.
        const permission = provider.code === 'mangaupdates' ? true : await runtime.options.beforeProviderSearch?.(provider.code) ?? true;
        if (permission !== true) throw new CoverRecoveryError(permission === false ? 'provider-daily-limit' : permission, true, permission === 'rate-limit-unavailable' ? 60 : 3600);
        const candidates = await runWithProviderRequestTimeout(runtime.options.requestTimeoutMs ?? 15000, () => provider.getCoverCandidatesByTitleSource!({ title: item.title, originalTitle: item.originalTitle, mediaType: item.mediaType as Parameters<NonNullable<MediaProvider['getCoverCandidatesByTitleSource']>>[0]['mediaType'], releaseYear: item.releaseYear, titleSource: { provider: provider.code, externalId: attempt.source.externalId } }, { ...runtime.options, signal: policy.signal } as CoverSearchOptions), policy.signal, { strictHttpErrors: true });
        policy.signal.throwIfAborted();
        const candidate = candidates.find(c => {
          const binding = parseSavedCoverSource(c.provider, c.id);
          // FantLab edition responses are already scoped to the requested work by the adapter.
          const matches = binding?.externalId === attempt.source.externalId || (provider.code === 'fantlab' && /^edition:[1-9]\d*$/.test(c.id));
          return c.provider === provider.code && matches && /^https?:\/\//.test(c.imageUrl);
        });
        if (candidate) return { kind: 'candidate', candidate, exactImage: false, replacement: Boolean(attempt.source.specificImage || (item.coverUrl && !attempt.saved)) };
      } catch (error) {
        policy.signal.throwIfAborted();
        if (error instanceof CoverRecoveryError) throw error;
        const e = error as { code?: string; message?: string; retryAfterSeconds?: number; status?: number; permanent?: boolean };
        if ([400, 401, 403, 404, 410].includes(e.status ?? 0) || e.permanent) continue;
        if (e.status === 429) throw new CoverRecoveryError('provider-rate-limit', true, e.retryAfterSeconds ?? 60);
        const code = e.code ?? e.message;
        if (['provider-daily-limit', 'provider-rate-limit', 'rate-limit-unavailable'].includes(code ?? '')) throw new CoverRecoveryError(code!, true, e.retryAfterSeconds ?? (code === 'provider-daily-limit' ? 3600 : 60));
        throw new CoverRecoveryError('provider-unavailable', true);
      }
    }
    return { kind: 'skip', code: 'source-unavailable' };
  };
}

async function loadRecoveryRuntime(): Promise<RecoveryRuntime> {
  const [{ getCoverSettings, getCoverProviderSettings, getCoverProviderCredentialsForSearch, getCoverProviderRateLimits }, { COVER_PROVIDERS }, { createProviderCoverSearchRateLimiter, wrapProviderSearchWithReserve }] = await Promise.all([import('@/db/queries/cover-settings'), import('./providers'), import('./rate-limits')]);
  const [settings, providerSettings, credentials, limits] = await Promise.all([getCoverSettings(), getCoverProviderSettings(), getCoverProviderCredentialsForSearch(), getCoverProviderRateLimits()]);
  const limiter = createProviderCoverSearchRateLimiter(limits);
  return { providers: COVER_PROVIDERS, settings: providerSettings, options: { candidateLimit: settings.candidateLimit, tmdbResultScanLimit: settings.tmdbResultScanLimit, requestTimeoutMs: settings.providerRequestTimeoutMs, providerCredentials: credentials, beforeProviderSearch: wrapProviderSearchWithReserve(limiter.canSearchProvider, limits, 100) } };
}
export const resolveRecoveryCover = createCoverRecoveryResolver(loadRecoveryRuntime);
