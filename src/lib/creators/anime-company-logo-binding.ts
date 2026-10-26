import { animeCompanyLogoBindingsQuery, animeCompanyLogoCreatorQuery, animeCompanyLogoSourceName, animeCompanyLogoSourceAllowed, registerAnimeCompanyLogoCandidates } from "@/db/queries/anime-company-logo-binding";
import { CreatorRequestError, resolveCreatorRequest } from "@/db/queries/creator-requests";
import { getCoverProviderCredentialsForSearch, getCoverProviderRateLimits, getCoverProviderSettings } from "@/db/queries/cover-settings";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot, withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { createProviderCoverSearchRateLimiter, wrapProviderSearchWithReserve } from "@/lib/covers/rate-limits";
import { fetchCreatorProfileSnapshot } from "@/lib/providers/creator-profile-service";
import type { CreatorProfileTarget } from "@/lib/providers/creator-profile-targets";
import { normalizeSearchText } from "@/lib/search/normalize";
import { JobError } from "@/lib/jobs/types";
import { canWriteCreatorImage } from "./image-policy";
import { animeCompanySearchDescriptor, exactAnimeCompanyCandidates, fetchAnimeCompanySearch, parseAnimeCompanySearch } from "./anime-company-logo-search";

export type AnimeCompanyLogoBindingResult = { status: "ready" | "pending" | "missing" | "unsupported" | "source-changed" };
const defaults = { creator: animeCompanyLogoCreatorQuery, bindings: animeCompanyLogoBindingsQuery, sourceAllowed: animeCompanyLogoSourceAllowed,
  settings: getCoverProviderSettings, credentials: getCoverProviderCredentialsForSearch, saved: getProviderSnapshot,
  started: providerRequestStartedAt, search: fetchAnimeCompanySearch, save: saveProviderSnapshot, guarded: withSnapshotJobGuard,
  register: registerAnimeCompanyLogoCandidates, profile: fetchCreatorProfileSnapshot, resolve: resolveCreatorRequest };
export type AnimeCompanyLogoDependencies = Partial<typeof defaults>;
/** Supplemental identity discovery only. No anime participation or image mutation is performed here. */
export async function ensureAnimeCompanyLogoBinding(creatorId: number, options: { signal: AbortSignal; refresh?: boolean; guard?: SnapshotJobGuard; beforeRequest?: (provider: CreatorProfileTarget["provider"]) => Promise<void> }, dependencies: AnimeCompanyLogoDependencies = {}): Promise<AnimeCompanyLogoBindingResult> {
  const d = { ...defaults, ...dependencies };
  const { signal, guard } = options;
  signal.throwIfAborted();
  const [row] = await d.creator(creatorId);
  if (!row || row.typeCode !== "organization" || !canWriteCreatorImage(row.creator)) return { status: "unsupported" };
  const bindings = await d.bindings(creatorId);
  const source = bindings.filter(binding => binding.active && binding.provider === "anilist" && /^studio:[1-9]\d*$/.test(binding.externalCreatorId));
  if (!source.length) return { status: "unsupported" };
  const tmdb = bindings.filter(binding => binding.provider === "tmdb" && binding.externalCreatorId.startsWith("company:"));
  if (tmdb.some(binding => binding.active)) return { status: "ready" };
  if (tmdb.length || source.length !== 1) return { status: "pending" };
  const query = animeCompanyLogoSourceName(row.creator);
  if (!query) return { status: "unsupported" };
  if (!await d.sourceAllowed(source[0], query)) return { status: "unsupported" };
  const descriptor = animeCompanySearchDescriptor(source[0].externalCreatorId.slice(7), query);
  let search = await d.saved(descriptor);
  const settings = await d.settings();
  if (!settings.some(setting => setting.providerCode === "tmdb" && setting.enabled)) return { status: "unsupported" };
  const credentials = await d.credentials();
  const token = credentials.tmdb?.accessToken?.trim();
  if (!token) return { status: "unsupported" };
  let beforeRequest = options.beforeRequest;
  if (!beforeRequest) {
    const limits = await getCoverProviderRateLimits();
    const limiter = createProviderCoverSearchRateLimiter(limits);
    const before = wrapProviderSearchWithReserve(limiter.canSearchProvider, limits, 100);
    beforeRequest = async provider => { if (typeof await before(provider) === "string") throw new JobError("provider-deferred", "Ожидание доступного лимита TMDB.", { deferSeconds: 60 }); };
  }
  if (!search || options.refresh) {
    const requestStartedAt = await d.started();
    const payload = await d.search(query, { token, signal, beforeRequest: () => beforeRequest!("tmdb") });
    search = await d.save({ ...descriptor, payload, payloadHash: "", contentType: "application/json", requestStartedAt, fetchedAt: new Date() }, guard);
  }
  const payload = parseAnimeCompanySearch(search.payload);
  if (payload.query !== query) throw new Error("INVALID_COMPANY_SEARCH");
  const exact = exactAnimeCompanyCandidates(payload);
  // Keep uniqueness based on the full result, but never moderate a logo search
  // result that cannot supply a logo.
  const candidates = (exact.length ? exact : payload.results).filter(candidate => Boolean(candidate.logo_path?.trim())).slice(0, 20);
  if (!candidates.length) return { status: "missing" };
  signal.throwIfAborted();
  const searchRef = { id: search.id, payloadHash: search.payloadHash };
  const requests = await d.guarded(guard, async tx => {
    const [current] = await d.creator(creatorId, tx);
    const currentBindings = await d.bindings(creatorId, tx);
    if (!current || current.typeCode !== "organization" || !canWriteCreatorImage(current.creator) || animeCompanyLogoSourceName(current.creator) !== query
      || !currentBindings.some(binding => binding.id === source[0].id && binding.active)
      || !await d.sourceAllowed(source[0], query, tx)) return [];
    return d.register(tx, creatorId, candidates, searchRef, source[0].externalCreatorId);
  });
  if (!requests.length) return { status: "source-changed" };
  if (requests.every(request => request.logoCandidateDecision === "reject")) return { status: "missing" };
  if (exact.length !== 1) return { status: "pending" };
  const candidate = exact[0];
  const request = requests.find(request => request.externalCreatorId === `company:${candidate.id}`);
  if (!request || request.logoCandidateDecision !== null || request.decision !== null || request.manuallyReopened || request.applyStatus !== "pending") return { status: "pending" };
  const profile = await d.profile({ provider: "tmdb", resourceType: "company", externalId: String(candidate.id) }, { signal, jobGuard: guard, onlyMissing: !options.refresh, credentials, beforeRequest });
  const details = profile.payload as { id?: unknown; name?: unknown };
  if (String(details.id) !== String(candidate.id) || typeof details.name !== "string" || normalizeSearchText(details.name) !== normalizeSearchText(query)) return { status: "pending" };
  signal.throwIfAborted();
  try {
    await d.resolve({ requestId: request.id, decision: "map", creatorId, autoApprove: true, jobGuard: guard,
      animeCompanyLogoEvidence: { creatorId, anilistBindingId: source[0].id, searchRef, profileRef: { id: profile.id, payloadHash: profile.payloadHash } } });
  } catch (error) {
    if (error instanceof CreatorRequestError && ["auto-skip", "already-resolved", "applying"].includes(error.code)) return { status: "pending" };
    throw error;
  }
  const current = await d.bindings(creatorId);
  return { status: current.some(binding => binding.active && binding.provider === "tmdb" && binding.externalCreatorId === `company:${candidate.id}`) ? "ready" : "source-changed" };
}
