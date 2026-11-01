import type { MediaProvider, MediaTitleCandidate, TitleSearchInput, ProviderSearchOptions } from "@/lib/covers/types";
import { normalizeSearchQuery } from "./shared";
import { describeMangaUpdatesSeries, mangaUpdatesCoverCandidates, mangaUpdatesImage, mangaUpdatesRecord, mangaUpdatesYear } from "@/lib/providers/mangaupdates-adapter";
import { fetchMangaUpdatesMetadata, requestMangaUpdates } from "@/lib/providers/mangaupdates-service";

async function search(input: TitleSearchInput, options: ProviderSearchOptions): Promise<MediaTitleCandidate[]> {
  const query = normalizeSearchQuery(input);
  if (input.mediaType !== "manga" || !query) return [];
  const payload = mangaUpdatesRecord(await requestMangaUpdates("series/search", options, { search: query, stype: "title", page: 1, perpage: options.candidateLimit, filter_types: ["Novel"] }));
  if (!Array.isArray(payload?.results)) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  return payload.results.flatMap(value => {
    const series = mangaUpdatesRecord(mangaUpdatesRecord(value)?.record);
    if (!series || series.type === "Novel" || typeof series.series_id !== "number" || typeof series.title !== "string" || !series.title.trim()) return [];
    try { describeMangaUpdatesSeries(String(series.series_id)); } catch { return []; }
    return [{ id: `series:${series.series_id}`, provider: "mangaupdates" as const, externalId: String(series.series_id), mediaType: input.mediaType, title: series.title.trim(), originalTitle: null, description: typeof series.description === "string" ? series.description : null, coverUrl: mangaUpdatesImage(series.image), sourcePageUrl: typeof series.url === "string" ? series.url : null, releaseYear: mangaUpdatesYear(series.year) }];
  }).slice(0, options.candidateLimit);
}
export const mangaUpdatesProvider: MediaProvider = {
  code: "mangaupdates", mediaTypes: ["manga"], searchTitleCandidates: search, getTitleMetadata: fetchMangaUpdatesMetadata,
  async searchCoverCandidates(input, options) {
    const candidates = await search({ query: normalizeSearchQuery(input), mediaType: input.mediaType }, options);
    return candidates.flatMap(candidate => candidate.coverUrl ? [{ id: candidate.id, provider: "mangaupdates" as const, title: candidate.title, imageUrl: candidate.coverUrl, sourcePageUrl: candidate.sourcePageUrl, year: candidate.releaseYear ?? undefined }] : []);
  },
  async getCoverCandidatesByTitleSource(input, options) {
    if (input.mediaType !== "manga" || input.titleSource?.provider !== "mangaupdates") return [];
    const { getProviderSnapshot } = await import("@/db/queries/provider-snapshots");
    const descriptor = describeMangaUpdatesSeries(input.titleSource.externalId);
    const primary = await getProviderSnapshot(descriptor);
    // Cover discovery does not import metadata or require a complete creator roster.
    const series = mangaUpdatesRecord(primary?.payload ?? await requestMangaUpdates(`series/${descriptor.externalId}`, options));
    return mangaUpdatesCoverCandidates(series, descriptor.externalId);
  },
};

