import type { MediaType } from "@/lib/media/types";

export type MediaProviderCode =
  | "tmdb"
  | "open-library"
  | "google-books"
  | "igdb"
  | "rawg"
  | "jikan";

export type CoverProviderCode = MediaProviderCode;

export const COVER_PROVIDER_CODES = [
  "tmdb",
  "open-library",
  "google-books",
  "igdb",
  "rawg",
  "jikan",
] as const satisfies readonly MediaProviderCode[];

export function isCoverProviderCode(value: string): value is CoverProviderCode {
  return COVER_PROVIDER_CODES.some((providerCode) => providerCode === value);
}

export type CoverCandidate = {
  id: string;
  provider: CoverProviderCode;
  title: string;
  imageUrl: string;
  sourcePageUrl: string | null;
  width?: number;
  height?: number;
  year?: number;
  confidence?: number;
};

export type SignedCoverCandidate = CoverCandidate & {
  token: string;
};

export type CoverSearchInput = {
  title: string;
  originalTitle: string | null;
  mediaType: MediaType;
  releaseYear: number | null;
};

export type TitleSearchInput = {
  query: string;
  mediaType: MediaType;
};

export type TitleMetadataInput = {
  provider: MediaProviderCode;
  externalId: string;
  mediaType: MediaType;
};

export type MediaTitleCandidate = {
  id: string;
  provider: MediaProviderCode;
  externalId: string;
  mediaType: MediaType;
  title: string;
  originalTitle: string | null;
  description: string | null;
  coverUrl: string | null;
  sourcePageUrl: string | null;
  releaseYear: number | null;
  confidence?: number;
};

export type MediaTitleMetadata = {
  provider: MediaProviderCode;
  externalId: string;
  sourceUrl: string | null;
  facts: Record<string, unknown>;
};

export type ProviderSearchOptions = {
  candidateLimit: number;
  tmdbResultScanLimit: number;
  providerCredentials?: Partial<Record<MediaProviderCode, Record<string, string>>>;
  beforeProviderSearch?: (providerCode: MediaProviderCode) => Promise<boolean>;
};

export type CoverSearchOptions = ProviderSearchOptions;
export type TitleSearchOptions = ProviderSearchOptions;
export type TitleMetadataOptions = ProviderSearchOptions;

export type MediaProvider = {
  code: MediaProviderCode;
  mediaTypes: readonly MediaType[];
  searchCoverCandidates?(
    input: CoverSearchInput,
    options: CoverSearchOptions,
  ): Promise<CoverCandidate[]>;
  searchTitleCandidates?(
    input: TitleSearchInput,
    options: TitleSearchOptions,
  ): Promise<MediaTitleCandidate[]>;
  getTitleMetadata?(
    input: TitleMetadataInput,
    options: TitleMetadataOptions,
  ): Promise<MediaTitleMetadata | null>;
};

export type CoverProvider = MediaProvider & {
  searchCoverCandidates(
    input: CoverSearchInput,
    options: CoverSearchOptions,
  ): Promise<CoverCandidate[]>;
};

export type CoverSourceInput = {
  provider: CoverProviderCode | null;
  externalId: string | null;
  pageUrl: string | null;
};
