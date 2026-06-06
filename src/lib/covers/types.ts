import type { MediaType } from "@/lib/media-types";

export type CoverProviderCode = "tmdb" | "open-library" | "google-books" | "rawg" | "jikan";

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

export type CoverProvider = {
  code: CoverProviderCode;
  mediaTypes: readonly MediaType[];
  searchCoverCandidates(input: CoverSearchInput): Promise<CoverCandidate[]>;
};

export type CoverSourceInput = {
  provider: CoverProviderCode | null;
  externalId: string | null;
  pageUrl: string | null;
};
