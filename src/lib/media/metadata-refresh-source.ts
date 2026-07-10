import type { MediaProviderCode } from "@/lib/covers/types";
import type { MediaType } from "@/lib/media/types";

export type MediaMetadataRefreshSource = {
  provider: MediaProviderCode;
  externalId: string;
  mediaType: MediaType;
};

export type MediaMetadataRefreshSourceInput = {
  mediaType: MediaType;
  metadata?: {
    sourceProvider: string | null;
    sourceExternalId: string | null;
  } | null;
  coverSource?: {
    provider: string | null | undefined;
    externalId: string | null | undefined;
    pageUrl: string | null | undefined;
  };
};

const MEDIA_PROVIDER_CODES = [
  "tmdb",
  "comic-vine",
  "open-library",
  "google-books",
  "igdb",
  "rawg",
  "jikan",
] as const satisfies readonly MediaProviderCode[];

function isMediaProviderCode(value: string | null | undefined): value is MediaProviderCode {
  return Boolean(value && MEDIA_PROVIDER_CODES.some((providerCode) => providerCode === value));
}

function getColonPartExternalId(value: string, prefix: string) {
  if (!value.startsWith(`${prefix}:`)) {
    return null;
  }

  return value.split(":")[1]?.trim() || null;
}

function getOpenLibraryExternalId(value: string) {
  if (value.startsWith("/")) {
    return value;
  }

  return getColonPartExternalId(value, "work");
}

function getTmdbExternalIdFromUrl(value: string | null | undefined) {
  return value?.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i)?.[1] ?? null;
}

function getOpenLibraryExternalIdFromUrl(value: string | null | undefined) {
  return value?.match(/openlibrary\.org(\/works\/[^/?#]+)/i)?.[1] ?? null;
}

function getJikanExternalIdFromUrl(value: string | null | undefined) {
  return value?.match(/myanimelist\.net\/anime\/(\d+)/i)?.[1] ?? null;
}

function getComicVineExternalIdFromUrl(value: string | null | undefined) {
  return value?.match(/comicvine\.gamespot\.com\/[^/]+\/4050-(\d+)/i)?.[1] ?? null;
}

function normalizeMetadataExternalId(
  provider: MediaProviderCode,
  externalId: string | null | undefined,
  pageUrl?: string | null,
) {
  const value = externalId?.trim() || "";

  if (provider === "tmdb") {
    return (
      getColonPartExternalId(value, "movie") ??
      getColonPartExternalId(value, "tv") ??
      (value && /^\d+$/.test(value) ? value : null) ??
      getTmdbExternalIdFromUrl(pageUrl)
    );
  }

  if (provider === "igdb" || provider === "rawg") {
    return getColonPartExternalId(value, "game") ?? (value && /^\d+$/.test(value) ? value : null);
  }

  if (provider === "jikan") {
    return (
      getColonPartExternalId(value, "anime") ??
      (value && /^\d+$/.test(value) ? value : null) ??
      getJikanExternalIdFromUrl(pageUrl)
    );
  }

  if (provider === "comic-vine") {
    return (
      getColonPartExternalId(value, "volume") ??
      (value && /^\d+$/.test(value) ? value : null) ??
      getComicVineExternalIdFromUrl(pageUrl)
    );
  }

  if (provider === "google-books") {
    return getColonPartExternalId(value, "volume") ?? (value || null);
  }

  return getOpenLibraryExternalId(value) ?? getOpenLibraryExternalIdFromUrl(pageUrl);
}

export function getMediaMetadataRefreshSource({
  mediaType,
  metadata,
  coverSource,
}: MediaMetadataRefreshSourceInput): MediaMetadataRefreshSource | null {
  if (isMediaProviderCode(metadata?.sourceProvider)) {
    const externalId = normalizeMetadataExternalId(
      metadata.sourceProvider,
      metadata.sourceExternalId,
    );

    if (externalId) {
      return { provider: metadata.sourceProvider, externalId, mediaType };
    }
  }

  if (!isMediaProviderCode(coverSource?.provider)) {
    return null;
  }

  const externalId = normalizeMetadataExternalId(
    coverSource.provider,
    coverSource.externalId,
    coverSource.pageUrl,
  );

  return externalId ? { provider: coverSource.provider, externalId, mediaType } : null;
}
