import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  parseCoverProviderRateLimitsFormInput,
  parseCoverProviderSettingsFormInput,
  parseCoverSettingsFormInput,
} from "@/lib/forms/cover-settings";
import {
  createCoverCandidateToken,
  normalizeCoverCandidates,
  verifyCoverCandidateToken,
} from "@/lib/covers/candidates";
import { DEFAULT_COVER_CANDIDATE_LIMIT, DEFAULT_COVER_MAX_BYTES } from "@/lib/covers/config";
import { validateCoverProviderCredentials } from "@/lib/covers/credential-validation";
import { getCoverProviderDefaultSettings } from "@/lib/covers/provider-settings";
import { createTmdbProvider } from "@/lib/covers/providers/tmdb";
import { anilistProvider } from "@/lib/covers/providers/anilist";
import {
  getCoverProvidersForMediaType,
  getTitleProvidersForMediaType,
  getTitleMetadata,
  searchCoverCandidates,
  searchTitleCandidates,
} from "@/lib/covers/registry";
import {
  buildCoverThumbObjectKey,
  isS3ObjectKey,
  resolveCoverUpload,
  uploadManualCover,
} from "@/lib/covers/storage";
import type {
  CoverCandidate,
  CoverProvider,
  CoverSearchOptions,
  MediaProvider,
} from "@/lib/covers/types";
import {
  createMediaMetadataCandidateToken,
  createMediaTitleSourceToken,
  verifyMediaMetadataCandidateToken,
  verifyMediaTitleSourceToken,
} from "@/lib/media/metadata-candidates";
import { resolveMediaMetadataFormMutation } from "@/lib/media/metadata-form-mutation";
import { getMediaMetadataRefreshSource } from "@/lib/media/metadata-refresh-source";
import { rankMetadataRefreshCandidates } from "@/lib/media/rank-metadata-refresh-candidates";
import {
  checkFixedWindowRateLimitWithClient,
  getFixedWindowRateLimitKey,
  getFixedWindowRetryAfterSeconds,
} from "@/lib/rate-limits/redis";

const baseCandidate = {
  id: "external:1",
  provider: "open-library",
  title: "Dune",
  imageUrl: "https://example.com/dune.jpg",
  sourcePageUrl: "https://example.com/dune",
} as const satisfies CoverCandidate;

describe("cover candidates", () => {
  it("keeps the candidate display limit explicit", () => {
    assert.equal(DEFAULT_COVER_CANDIDATE_LIMIT, 8);
  });

  it("normalizes candidates and removes broken or duplicate image URLs", () => {
    assert.deepEqual(
      normalizeCoverCandidates([
        baseCandidate,
        { ...baseCandidate, id: "external:2" },
        { ...baseCandidate, id: "", imageUrl: "https://example.com/empty.jpg" },
        { ...baseCandidate, id: "external:3", imageUrl: "/relative.jpg" },
        { ...baseCandidate, id: "external:4", imageUrl: "https://example.com/other.jpg" },
      ]),
      [baseCandidate, { ...baseCandidate, id: "external:4", imageUrl: "https://example.com/other.jpg" }],
    );
  });

  it("signs and verifies cover candidate tokens", () => {
    process.env.COVER_CANDIDATE_SECRET = "test-secret";

    const token = createCoverCandidateToken(baseCandidate);

    assert.deepEqual(verifyCoverCandidateToken(token), baseCandidate);
    assert.equal(verifyCoverCandidateToken(`${token}x`), null);
  });
});

describe("metadata candidate source", () => {
  it("signs and verifies the selected title source", () => {
    process.env.COVER_CANDIDATE_SECRET = "test-secret";

    const token = createMediaTitleSourceToken({
      provider: "anilist",
      externalId: " 100 ",
    });

    assert.deepEqual(verifyMediaTitleSourceToken(token), {
      provider: "anilist",
      externalId: "100",
    });
  });

  it("rejects tampered, expired, and unknown title source tokens", () => {
    process.env.COVER_CANDIDATE_SECRET = "test-secret";
    const originalDateNow = Date.now;
    const issuedAt = 1_700_000_000_000;

    Date.now = () => issuedAt;

    try {
      const token = createMediaTitleSourceToken({
        provider: "anilist",
        externalId: "100",
      });
      const unknownProviderToken = createMediaTitleSourceToken({
        provider: "unknown-provider",
        externalId: "100",
      } as never);

      assert.equal(verifyMediaTitleSourceToken(`${token}x`), null);
      assert.equal(verifyMediaTitleSourceToken(unknownProviderToken), null);

      Date.now = () => issuedAt + 6 * 60 * 60 * 1000;
      assert.equal(verifyMediaTitleSourceToken(token), null);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it("keeps selected title metadata independent from a cover selected at another provider", () => {
    process.env.COVER_CANDIDATE_SECRET = "test-secret";

    const metadataToken = createMediaMetadataCandidateToken({
      provider: "anilist",
      externalId: "100",
      sourceUrl: "https://anilist.co/anime/100",
      facts: { genres: ["Adventure"] },
    });
    const coverToken = createCoverCandidateToken({
      id: "movie:8953:/steamboy.jpg",
      provider: "tmdb",
      title: "Steamboy",
      imageUrl: "https://image.tmdb.org/t/p/w780/steamboy.jpg",
      sourcePageUrl: "https://www.themoviedb.org/movie/8953",
    });

    assert.deepEqual(verifyMediaMetadataCandidateToken(metadataToken), {
      provider: "anilist",
      externalId: "100",
      sourceUrl: "https://anilist.co/anime/100",
      facts: { genres: ["Adventure"] },
    });
    assert.equal(verifyCoverCandidateToken(coverToken)?.provider, "tmdb");
  });

  it("rejects a signed metadata candidate with an unknown source provider", () => {
    process.env.COVER_CANDIDATE_SECRET = "test-secret";

    const token = createMediaMetadataCandidateToken({
      provider: "unknown-provider",
      externalId: "100",
      sourceUrl: null,
      facts: {},
    } as never);

    assert.equal(verifyMediaMetadataCandidateToken(token), null);
  });
});

describe("metadata form mutation", () => {
  it("keeps metadata when the selected source did not change", () => {
    assert.deepEqual(
      resolveMediaMetadataFormMutation({
        metadataCandidateToken: null,
        titleSourceToken: null,
        sourceChanged: false,
      }),
      { type: "keep" },
    );
  });

  it("deletes metadata when the selected source was cleared", () => {
    assert.deepEqual(
      resolveMediaMetadataFormMutation({
        metadataCandidateToken: null,
        titleSourceToken: null,
        sourceChanged: true,
      }),
      { type: "delete" },
    );
  });

  it("upserts a changed source without facts when metadata has not loaded yet", () => {
    process.env.COVER_CANDIDATE_SECRET = "test-secret";
    const titleSourceToken = createMediaTitleSourceToken({
      provider: "anilist",
      externalId: "100",
    });

    assert.deepEqual(
      resolveMediaMetadataFormMutation({
        metadataCandidateToken: null,
        titleSourceToken,
        sourceChanged: true,
      }),
      {
        type: "upsert",
        facts: {},
        sourceProvider: "anilist",
        sourceExternalId: "100",
        sourceUrl: null,
        fetchedAt: null,
      },
    );
  });

  it("rejects changed metadata without a selected title source", () => {
    process.env.COVER_CANDIDATE_SECRET = "test-secret";
    const metadataCandidateToken = createMediaMetadataCandidateToken({
      provider: "anilist",
      externalId: "100",
      sourceUrl: "https://anilist.co/anime/100",
      facts: { genres: ["Adventure"] },
    });

    assert.deepEqual(
      resolveMediaMetadataFormMutation({
        metadataCandidateToken,
        titleSourceToken: null,
        sourceChanged: true,
      }),
      { type: "reject" },
    );
  });

  it("rejects metadata from a different source than the selected title", () => {
    process.env.COVER_CANDIDATE_SECRET = "test-secret";
    const metadataCandidateToken = createMediaMetadataCandidateToken({
      provider: "tmdb",
      externalId: "8953",
      sourceUrl: "https://www.themoviedb.org/movie/8953",
      facts: { runtimeMinutes: 126 },
    });
    const titleSourceToken = createMediaTitleSourceToken({
      provider: "anilist",
      externalId: "100",
    });

    assert.deepEqual(
      resolveMediaMetadataFormMutation({
        metadataCandidateToken,
        titleSourceToken,
        sourceChanged: true,
      }),
      { type: "reject" },
    );
  });

  it("upserts facts when metadata and selected title tokens match", () => {
    process.env.COVER_CANDIDATE_SECRET = "test-secret";
    const facts = { genres: ["Adventure"], runtimeMinutes: 126 };
    const metadataCandidateToken = createMediaMetadataCandidateToken({
      provider: "anilist",
      externalId: "100",
      sourceUrl: "https://anilist.co/anime/100",
      facts,
    });
    const titleSourceToken = createMediaTitleSourceToken({
      provider: "anilist",
      externalId: "100",
    });

    assert.deepEqual(
      resolveMediaMetadataFormMutation({
        metadataCandidateToken,
        titleSourceToken,
        sourceChanged: true,
      }),
      {
        type: "upsert",
        facts,
        sourceProvider: "anilist",
        sourceExternalId: "100",
        sourceUrl: "https://anilist.co/anime/100",
        fetchedAt: undefined,
      },
    );
  });
});

describe("metadata refresh form contract", () => {
  it("ranks candidates without losing the signed title source token", () => {
    const exactCandidate = {
      id: "anilist:100",
      provider: "anilist",
      externalId: "100",
      mediaType: "anime",
      title: "Steamboy",
      originalTitle: "スチームボーイ",
      description: null,
      coverUrl: null,
      sourcePageUrl: "https://anilist.co/anime/100",
      releaseYear: 2004,
      titleSourceToken: "signed-anilist-source",
    } as const;
    const otherCandidate = {
      ...exactCandidate,
      id: "tmdb:8953",
      provider: "tmdb",
      externalId: "8953",
      releaseYear: 2005,
      titleSourceToken: "signed-tmdb-source",
    } as const;

    const ranked = rankMetadataRefreshCandidates(
      [otherCandidate, exactCandidate],
      {
        title: " Steamboy ",
        originalTitle: "スチームボーイ",
        releaseYear: "2004",
      },
    );

    assert.equal(ranked[0], exactCandidate);
    assert.equal(ranked[0]?.titleSourceToken, "signed-anilist-source");
    assert.deepEqual(ranked, [exactCandidate, otherCandidate]);
  });

  for (const formPath of [
    "src/app/admin/(protected)/media/media-form.tsx",
    "src/app/author/(protected)/media/media-item-form.tsx",
  ]) {
    it(`keeps the signed title source selected by fallback refresh in ${formPath}`, () => {
      const source = readFileSync(formPath, "utf8");

      assert.match(source, /rankMetadataRefreshCandidates\(/);
      assert.match(
        source,
        /setSelectedTitleSource\(\{\s*provider: nextTitleSource\.provider,\s*externalId: nextTitleSource\.externalId,\s*token: nextTitleSource\.titleSourceToken,/,
      );
      assert.match(source, /setHasSelectedNewTitleSource\(true\)/);
    });
  }
});

describe("media metadata refresh source", () => {
  it("uses the selected title source before persisted metadata", () => {
    assert.deepEqual(
      getMediaMetadataRefreshSource({
        mediaType: "anime",
        titleSource: {
          provider: "anilist",
          externalId: "100",
        },
        metadata: {
          sourceProvider: "tmdb",
          sourceExternalId: "8953",
        },
      }),
      {
        provider: "anilist",
        externalId: "100",
        mediaType: "anime",
      },
    );
  });

  it("falls back to the persisted metadata source without a selected title source", () => {
    assert.deepEqual(
      getMediaMetadataRefreshSource({
        mediaType: "film",
        titleSource: null,
        metadata: {
          sourceProvider: "tmdb",
          sourceExternalId: "123",
        },
      }),
      {
        provider: "tmdb",
        externalId: "123",
        mediaType: "film",
      },
    );
  });

  it("does not use a cover-only TMDB source for metadata refresh", () => {
    const legacyCoverOnlyInput = {
      mediaType: "series",
      titleSource: null,
      metadata: null,
      coverSource: {
        provider: "tmdb",
        externalId: "tv:456:/poster.jpg",
        pageUrl: "https://www.themoviedb.org/tv/456",
      },
    } as const;

    assert.equal(getMediaMetadataRefreshSource(legacyCoverOnlyInput), null);
  });
});

describe("cover provider registry", () => {
  const customOptions = {
    candidateLimit: 2,
    tmdbResultScanLimit: 1,
  } satisfies CoverSearchOptions;
  const providers = [
    {
      code: "open-library",
      mediaTypes: ["book"],
      async searchCoverCandidates(_input, options) {
        return [
          baseCandidate,
          { ...baseCandidate, id: "external:2", imageUrl: "https://example.com/dune-2.jpg" },
          { ...baseCandidate, id: "external:3", imageUrl: "https://example.com/dune-3.jpg" },
        ].slice(0, options.candidateLimit);
      },
    },
    {
      code: "google-books",
      mediaTypes: ["book"],
      async searchCoverCandidates() {
        throw new Error("provider is down");
      },
    },
    {
      code: "rawg",
      mediaTypes: ["game"],
      async searchCoverCandidates() {
        return [{ ...baseCandidate, provider: "rawg", id: "game:1" }];
      },
    },
  ] satisfies CoverProvider[];

  it("selects providers by media type", () => {
    assert.deepEqual(
      getCoverProvidersForMediaType("book", providers).map((provider) => provider.code),
      ["open-library", "google-books"],
    );
    assert.deepEqual(
      getCoverProvidersForMediaType("comic", providers).map((provider) => provider.code),
      [],
    );
  });

  it("includes ComicVine as the default comic provider", () => {
    assert.deepEqual(
      getCoverProviderDefaultSettings()
        .filter((provider) => provider.mediaType === "comic")
        .map((provider) => ({
          providerCode: provider.providerCode,
          enabled: provider.enabled,
          priority: provider.priority,
        })),
      [{ providerCode: "comic-vine", enabled: true, priority: 10 }],
    );
  });

  it("uses Jikan, AniList, then TMDB as the default anime providers", () => {
    assert.deepEqual(
      getCoverProviderDefaultSettings().filter((provider) => provider.mediaType === "anime"),
      [
        { mediaType: "anime", providerCode: "jikan", enabled: true, priority: 10 },
        { mediaType: "anime", providerCode: "anilist", enabled: true, priority: 20 },
        { mediaType: "anime", providerCode: "tmdb", enabled: true, priority: 30 },
      ],
    );
  });

  it("searches AniList through its public GraphQL endpoint without credentials", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl: URL | null = null;
    let requestInit: RequestInit | undefined;

    globalThis.fetch = async (input, init) => {
      requestedUrl = new URL(String(input));
      requestInit = init;

      return Response.json({
        data: {
          Page: {
            media: [
              {
                id: 16498,
                title: {
                  english: "Attack on Titan",
                  romaji: "Shingeki no Kyojin",
                  native: "進撃の巨人",
                },
                description: "Humanity fights Titans.",
                coverImage: {
                  large: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498.jpg",
                  medium: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx16498.jpg",
                },
                siteUrl: "https://anilist.co/anime/16498",
                seasonYear: 2013,
                popularity: 900000,
              },
            ],
          },
        },
      });
    };

    try {
      assert.deepEqual(
        await anilistProvider.searchTitleCandidates?.(
          { mediaType: "anime", query: " Attack on Titan " },
          customOptions,
        ),
        [
          {
            id: "anime:16498",
            provider: "anilist",
            externalId: "16498",
            mediaType: "anime",
            title: "Attack on Titan",
            originalTitle: "Shingeki no Kyojin",
            description: "Humanity fights Titans.",
            coverUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498.jpg",
            sourcePageUrl: "https://anilist.co/anime/16498",
            releaseYear: 2013,
            confidence: 900000,
          },
        ],
      );

      assert.equal(requestedUrl?.href, "https://graphql.anilist.co/");
      assert.equal(requestInit?.method, "POST");
      assert.match(String(requestInit?.headers && new Headers(requestInit.headers).get("content-type")), /application\/json/i);
      const body = JSON.parse(String(requestInit?.body)) as { query: string; variables: Record<string, unknown> };
      assert.match(body.query, /media\s*\(.*type\s*:\s*ANIME/s);
      assert.deepEqual(body.variables, { search: "Attack on Titan", perPage: 2 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps AniList anime studios and genres from public GraphQL metadata", async () => {
    const originalFetch = globalThis.fetch;
    let requestInit: RequestInit | undefined;

    globalThis.fetch = async (_input, init) => {
      requestInit = init;

      return Response.json({
        data: {
          Media: {
            id: 16498,
            siteUrl: "https://anilist.co/anime/16498",
            episodes: 25,
            duration: 24,
            format: "TV",
            status: "FINISHED",
            studios: {
              nodes: [{ name: "WIT STUDIO" }, { name: "Production I.G" }],
            },
            genres: ["Action", "Drama"],
          },
        },
      });
    };

    try {
      assert.deepEqual(
        await anilistProvider.getTitleMetadata?.(
          { provider: "anilist", externalId: "16498", mediaType: "anime" },
          customOptions,
        ),
        {
          provider: "anilist",
          externalId: "16498",
          sourceUrl: "https://anilist.co/anime/16498",
          facts: {
            episodeCount: 25,
            status: "FINISHED",
            animeType: "TV",
            averageEpisodeRuntimeMinutes: 24,
            studios: ["WIT STUDIO", "Production I.G"],
            genres: ["Action", "Drama"],
          },
        },
      );

      const body = JSON.parse(String(requestInit?.body)) as { query: string; variables: Record<string, unknown> };
      assert.match(body.query, /studios\s*\{\s*nodes\s*\{\s*name\s*\}\s*\}/s);
      assert.match(body.query, /\bgenres\b/);
      assert.deepEqual(body.variables, { id: 16498 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses TMDB TV endpoints and TV metadata for anime", async () => {
    const provider = createTmdbProvider("anime");
    const originalFetch = globalThis.fetch;
    const requestedPaths: string[] = [];

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      requestedPaths.push(url.pathname);

      if (url.pathname === "/3/search/tv") {
        return Response.json({
          results: [
            {
              id: 42,
              name: "Аниме",
              original_name: "Anime",
              first_air_date: "2024-01-01",
            },
          ],
        });
      }

      return Response.json({
        episode_run_time: [24],
        first_air_date: "2024-01-01",
        genres: [{ name: "Animation" }],
        networks: [{ name: "TV Tokyo" }],
        number_of_episodes: 12,
        number_of_seasons: 1,
      });
    };

    try {
      assert.deepEqual(
        await provider.searchTitleCandidates?.(
          { mediaType: "anime", query: "Anime" },
          {
            ...customOptions,
            providerCredentials: { tmdb: { accessToken: "test-token" } },
          },
        ),
        [
          {
            id: "tv:42",
            provider: "tmdb",
            externalId: "42",
            mediaType: "anime",
            title: "Аниме",
            originalTitle: "Anime",
            description: null,
            coverUrl: null,
            sourcePageUrl: "https://www.themoviedb.org/tv/42",
            releaseYear: 2024,
            confidence: undefined,
          },
        ],
      );
      assert.deepEqual(
        await provider.getTitleMetadata?.(
          { provider: "tmdb", externalId: "42", mediaType: "anime" },
          {
            ...customOptions,
            providerCredentials: { tmdb: { accessToken: "test-token" } },
          },
        ),
        {
          provider: "tmdb",
          externalId: "42",
          sourceUrl: "https://www.themoviedb.org/tv/42",
          facts: {
            seasonCount: 1,
            episodeCount: 12,
            averageEpisodeRuntimeMinutes: 24,
            genres: ["Animation"],
            networks: ["TV Tokyo"],
            firstAirYear: 2024,
            lastAirYear: null,
          },
        },
      );
      assert.deepEqual(requestedPaths, ["/3/search/tv", "/3/tv/42"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("finds feature-length anime covers through TMDB movie search", async () => {
    const provider = createTmdbProvider("anime");
    const originalFetch = globalThis.fetch;
    const requestedPaths: string[] = [];

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      requestedPaths.push(url.pathname);

      if (url.pathname === "/3/search/tv") {
        return Response.json({ results: [] });
      }

      if (url.pathname === "/3/search/movie") {
        return Response.json({
          results: [
            {
              id: 8953,
              title: "Steamboy",
              original_title: "スチームボーイ",
              original_language: "ja",
              release_date: "2004-07-17",
            },
          ],
        });
      }

      if (url.pathname === "/3/movie/8953/images") {
        return Response.json({
          posters: [
            {
              file_path: "/steamboy.jpg",
              iso_639_1: "ja",
              width: 1000,
              height: 1500,
              vote_average: 5.4,
            },
          ],
        });
      }

      throw new Error(`Unexpected TMDB request: ${url.pathname}`);
    };

    try {
      assert.deepEqual(
        await provider.searchCoverCandidates?.(
          {
            title: "Steamboy",
            originalTitle: "スチームボーイ",
            mediaType: "anime",
            releaseYear: 2004,
          },
          {
            candidateLimit: 8,
            tmdbResultScanLimit: 3,
            providerCredentials: { tmdb: { accessToken: "test-token" } },
          },
        ),
        [
          {
            id: "movie:8953:/steamboy.jpg",
            provider: "tmdb",
            title: "Steamboy",
            imageUrl: "https://image.tmdb.org/t/p/w780/steamboy.jpg",
            sourcePageUrl: "https://www.themoviedb.org/movie/8953",
            width: 1000,
            height: 1500,
            year: 2004,
            confidence: 5.4,
          },
        ],
      );
      assert.deepEqual(requestedPaths, [
        "/3/search/tv",
        "/3/search/movie",
        "/3/movie/8953/images",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("merges TMDB TV and movie anime covers under one candidate limit", async () => {
    const provider = createTmdbProvider("anime");
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));

      if (url.pathname === "/3/search/tv") {
        return Response.json({
          results: [
            {
              id: 10,
              name: "Anime TV",
              original_language: "ja",
              first_air_date: "2004-01-01",
            },
          ],
        });
      }

      if (url.pathname === "/3/search/movie") {
        return Response.json({
          results: [
            {
              id: 20,
              title: "Anime Movie",
              original_language: "ja",
              release_date: "2004-07-17",
            },
          ],
        });
      }

      if (url.pathname === "/3/tv/10/images") {
        return Response.json({
          posters: [
            { file_path: "/tv-1.jpg", iso_639_1: "ja" },
            { file_path: "/tv-2.jpg", iso_639_1: "en" },
          ],
        });
      }

      if (url.pathname === "/3/movie/20/images") {
        return Response.json({
          posters: [
            { file_path: "/movie-1.jpg", iso_639_1: "ja" },
            { file_path: "/movie-2.jpg", iso_639_1: "en" },
          ],
        });
      }

      throw new Error(`Unexpected TMDB request: ${url.pathname}`);
    };

    try {
      const candidates = await provider.searchCoverCandidates?.(
        {
          title: "Anime",
          originalTitle: null,
          mediaType: "anime",
          releaseYear: 2004,
        },
        {
          candidateLimit: 3,
          tmdbResultScanLimit: 2,
          providerCredentials: { tmdb: { accessToken: "test-token" } },
        },
      );

      assert.equal(candidates?.length, 3);
      assert.deepEqual(
        candidates?.map((candidate) => candidate.id),
        ["tv:10:/tv-1.jpg", "movie:20:/movie-1.jpg", "tv:10:/tv-2.jpg"],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps movie anime covers when TMDB TV search fails", async () => {
    const provider = createTmdbProvider("anime");
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));

      if (url.pathname === "/3/search/tv") {
        throw new Error("TMDB TV search is unavailable");
      }

      if (url.pathname === "/3/search/movie") {
        return Response.json({
          results: [
            {
              id: 8953,
              title: "Steamboy",
              original_language: "ja",
              release_date: "2004-07-17",
            },
          ],
        });
      }

      if (url.pathname === "/3/movie/8953/images") {
        return Response.json({ posters: [{ file_path: "/steamboy.jpg" }] });
      }

      throw new Error(`Unexpected TMDB request: ${url.pathname}`);
    };

    try {
      const candidates = await provider.searchCoverCandidates?.(
        {
          title: "Steamboy",
          originalTitle: "スチームボーイ",
          mediaType: "anime",
          releaseYear: 2004,
        },
        {
          candidateLimit: 8,
          tmdbResultScanLimit: 3,
          providerCredentials: { tmdb: { accessToken: "test-token" } },
        },
      );

      assert.deepEqual(candidates?.map((candidate) => candidate.id), [
        "movie:8953:/steamboy.jpg",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps successful anime image groups when another TMDB images request fails", async () => {
    const provider = createTmdbProvider("anime");
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));

      if (url.pathname === "/3/search/tv") {
        return Response.json({
          results: [{ id: 10, name: "Anime TV", first_air_date: "2004-01-01" }],
        });
      }

      if (url.pathname === "/3/search/movie") {
        return Response.json({
          results: [{ id: 20, title: "Anime Movie", release_date: "2004-07-17" }],
        });
      }

      if (url.pathname === "/3/tv/10/images") {
        throw new Error("TMDB TV images are unavailable");
      }

      if (url.pathname === "/3/movie/20/images") {
        return Response.json({ posters: [{ file_path: "/movie.jpg" }] });
      }

      throw new Error(`Unexpected TMDB request: ${url.pathname}`);
    };

    try {
      const candidates = await provider.searchCoverCandidates?.(
        {
          title: "Anime",
          originalTitle: null,
          mediaType: "anime",
          releaseYear: 2004,
        },
        {
          candidateLimit: 8,
          tmdbResultScanLimit: 3,
          providerCredentials: { tmdb: { accessToken: "test-token" } },
        },
      );

      assert.deepEqual(candidates?.map((candidate) => candidate.id), [
        "movie:20:/movie.jpg",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps film and series TMDB cover searches on their own endpoints", async () => {
    for (const scenario of [
      {
        mediaType: "film",
        searchPath: "/3/search/movie",
        imagesPath: "/3/movie/31/images",
        result: { id: 31, title: "Film", release_date: "2020-01-01" },
        expectedId: "movie:31:/film.jpg",
        posterPath: "/film.jpg",
      },
      {
        mediaType: "series",
        searchPath: "/3/search/tv",
        imagesPath: "/3/tv/32/images",
        result: { id: 32, name: "Series", first_air_date: "2021-01-01" },
        expectedId: "tv:32:/series.jpg",
        posterPath: "/series.jpg",
      },
    ] as const) {
      const provider = createTmdbProvider(scenario.mediaType);
      const originalFetch = globalThis.fetch;
      const requestedPaths: string[] = [];

      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        requestedPaths.push(url.pathname);

        if (url.pathname === scenario.searchPath) {
          return Response.json({ results: [scenario.result] });
        }

        if (url.pathname === scenario.imagesPath) {
          return Response.json({ posters: [{ file_path: scenario.posterPath }] });
        }

        throw new Error(`Unexpected TMDB request: ${url.pathname}`);
      };

      try {
        const candidates = await provider.searchCoverCandidates?.(
          {
            title: scenario.mediaType === "film" ? "Film" : "Series",
            originalTitle: null,
            mediaType: scenario.mediaType,
            releaseYear: scenario.mediaType === "film" ? 2020 : 2021,
          },
          {
            candidateLimit: 8,
            tmdbResultScanLimit: 3,
            providerCredentials: { tmdb: { accessToken: "test-token" } },
          },
        );

        assert.deepEqual(candidates?.map((candidate) => candidate.id), [scenario.expectedId]);
        assert.deepEqual(requestedPaths, [scenario.searchPath, scenario.imagesPath]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  });

  it("returns successful provider results when another provider fails", async () => {
    assert.deepEqual(
      await searchCoverCandidates(
        {
          title: "Dune",
          originalTitle: null,
          mediaType: "book",
          releaseYear: null,
        },
        providers,
        customOptions,
      ),
      [baseCandidate, { ...baseCandidate, id: "external:2", imageUrl: "https://example.com/dune-2.jpg" }],
    );
  });

  it("does not search without a title", async () => {
    assert.deepEqual(
      await searchCoverCandidates(
        {
          title: " ",
          originalTitle: null,
          mediaType: "book",
          releaseYear: null,
        },
        providers,
        customOptions,
      ),
      [],
    );
  });

  it("uses only the selected title source for an exact cover lookup", async () => {
    let textSearchCalls = 0;
    let directLookupCalls = 0;
    const exactProviders = [
      {
        code: "open-library",
        mediaTypes: ["book"],
        async searchCoverCandidates() {
          textSearchCalls += 1;
          return [];
        },
        async getCoverCandidatesByTitleSource(input) {
          directLookupCalls += 1;
          assert.deepEqual(input.titleSource, { provider: "open-library", externalId: "/works/OL1W" });
          return [baseCandidate];
        },
      },
      {
        code: "google-books",
        mediaTypes: ["book"],
        async searchCoverCandidates() {
          textSearchCalls += 1;
          return [];
        },
        async getCoverCandidatesByTitleSource() {
          directLookupCalls += 100;
          return [];
        },
      },
    ] satisfies MediaProvider[];

    assert.deepEqual(
      await searchCoverCandidates(
        {
          title: "Dune",
          originalTitle: null,
          mediaType: "book",
          releaseYear: 1965,
          titleSource: { provider: "open-library", externalId: "/works/OL1W" },
        },
        exactProviders,
        customOptions,
      ),
      [baseCandidate],
    );
    assert.equal(directLookupCalls, 1);
    assert.equal(textSearchCalls, 0);
  });

  it("fills anime covers from fallback providers up to the configured limit", async () => {
    const exactAniListCover = {
      id: "anime:1",
      provider: "anilist",
      title: "Anime",
      imageUrl: "https://example.com/anilist.jpg",
      sourcePageUrl: "https://anilist.co/anime/1",
    } as const satisfies CoverCandidate;
    const jikanCover = {
      id: "anime:2",
      provider: "jikan",
      title: "Anime",
      imageUrl: "https://example.com/jikan.jpg",
      sourcePageUrl: "https://myanimelist.net/anime/2",
    } as const satisfies CoverCandidate;
    const tmdbCover = {
      id: "tv:3:/tmdb.jpg",
      provider: "tmdb",
      title: "Anime",
      imageUrl: "https://example.com/tmdb.jpg",
      sourcePageUrl: "https://www.themoviedb.org/tv/3",
    } as const satisfies CoverCandidate;
    const fallbackCalls: string[] = [];
    const animeProviders = [
      {
        code: "anilist",
        mediaTypes: ["anime"],
        async getCoverCandidatesByTitleSource() {
          return [exactAniListCover];
        },
        async searchCoverCandidates() {
          fallbackCalls.push("anilist");
          return [];
        },
      },
      {
        code: "jikan",
        mediaTypes: ["anime"],
        async searchCoverCandidates() {
          fallbackCalls.push("jikan");
          return [
            { ...jikanCover, id: "anime:duplicate", imageUrl: exactAniListCover.imageUrl },
            jikanCover,
          ];
        },
      },
      {
        code: "tmdb",
        mediaTypes: ["anime"],
        async searchCoverCandidates() {
          fallbackCalls.push("tmdb");
          return [tmdbCover];
        },
      },
    ] satisfies CoverProvider[];

    assert.deepEqual(
      await searchCoverCandidates(
        {
          title: "Anime",
          originalTitle: "アニメ",
          mediaType: "anime",
          releaseYear: 2024,
          titleSource: { provider: "anilist", externalId: "1" },
        },
        animeProviders,
        {
          candidateLimit: 3,
          tmdbResultScanLimit: 1,
          providerCredentials: { tmdb: { accessToken: "test-token" } },
        },
        [
          { mediaType: "anime", providerCode: "anilist", enabled: true, priority: 10 },
          { mediaType: "anime", providerCode: "jikan", enabled: true, priority: 20 },
          { mediaType: "anime", providerCode: "tmdb", enabled: true, priority: 30 },
        ],
      ),
      [exactAniListCover, jikanCover, tmdbCover],
    );
    assert.deepEqual(fallbackCalls, ["jikan", "tmdb"]);
  });

  it("falls back to the next anime provider when the exact AniList lookup fails", async () => {
    const jikanCover = {
      id: "anime:2",
      provider: "jikan",
      title: "Anime",
      imageUrl: "https://example.com/jikan-fallback.jpg",
      sourcePageUrl: "https://myanimelist.net/anime/2",
    } as const satisfies CoverCandidate;
    const animeProviders = [
      {
        code: "anilist",
        mediaTypes: ["anime"],
        async getCoverCandidatesByTitleSource() {
          throw new Error("AniList is unavailable");
        },
        async searchCoverCandidates() {
          return [];
        },
      },
      {
        code: "jikan",
        mediaTypes: ["anime"],
        async searchCoverCandidates() {
          return [jikanCover];
        },
      },
    ] satisfies CoverProvider[];

    assert.deepEqual(
      await searchCoverCandidates(
        {
          title: "Anime",
          originalTitle: null,
          mediaType: "anime",
          releaseYear: null,
          titleSource: { provider: "anilist", externalId: "1" },
        },
        animeProviders,
        customOptions,
      ),
      [jikanCover],
    );
  });

  it("passes the release year to TMDB when falling back to text cover search", async () => {
    const provider = createTmdbProvider("film");
    const originalFetch = globalThis.fetch;
    let requestedUrl: URL | null = null;

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));

      if (url.pathname === "/3/search/movie") {
        requestedUrl = url;
        return Response.json({ results: [] });
      }

      return Response.json({ posters: [] });
    };

    try {
      assert.deepEqual(
        await provider.searchCoverCandidates?.(
          {
            title: "Dune",
            originalTitle: null,
            mediaType: "film",
            releaseYear: 2021,
          },
          {
            ...customOptions,
            providerCredentials: { tmdb: { accessToken: "test-token" } },
          },
        ),
        [],
      );
      assert.equal(requestedUrl?.searchParams.get("year"), "2021");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("filters disabled providers and sorts enabled providers by priority", () => {
    assert.deepEqual(
      getCoverProvidersForMediaType("book", providers, [
        { mediaType: "book", providerCode: "google-books", enabled: true, priority: 10 },
        { mediaType: "book", providerCode: "open-library", enabled: false, priority: 20 },
        { mediaType: "game", providerCode: "rawg", enabled: true, priority: 10 },
      ]).map((provider) => provider.code),
      ["google-books"],
    );
  });

  it("keeps provider priority scoped to the selected media type", () => {
    assert.deepEqual(
      getCoverProvidersForMediaType("book", providers, [
        { mediaType: "game", providerCode: "rawg", enabled: true, priority: 1 },
        { mediaType: "book", providerCode: "google-books", enabled: true, priority: 20 },
        { mediaType: "book", providerCode: "open-library", enabled: true, priority: 10 },
      ]).map((provider) => provider.code),
      ["open-library", "google-books"],
    );
  });

  it("skips providers rejected by the provider search guard", async () => {
    let calls = 0;

    const guardedProviders = [
      {
        code: "open-library",
        mediaTypes: ["book"],
        async searchCoverCandidates() {
          calls += 1;
          return [baseCandidate];
        },
      },
    ] satisfies CoverProvider[];

    assert.deepEqual(
      await searchCoverCandidates(
        {
          title: "Dune",
          originalTitle: null,
          mediaType: "book",
          releaseYear: null,
        },
        guardedProviders,
        {
          ...customOptions,
          beforeProviderSearch: async () => false,
        },
      ),
      [],
    );
    assert.equal(calls, 0);
  });

  it("searches title candidates through providers with title capability", async () => {
    const titleProviders = [
      {
        code: "open-library",
        mediaTypes: ["book"],
        async searchTitleCandidates(input) {
          return [
            {
              id: "work:/works/OL27448W",
              provider: "open-library",
              externalId: "/works/OL27448W",
              mediaType: input.mediaType,
              title: input.query,
              originalTitle: null,
              description: null,
              coverUrl: null,
              sourcePageUrl: "https://openlibrary.org/works/OL27448W",
              releaseYear: 1965,
            },
          ];
        },
      },
      {
        code: "google-books",
        mediaTypes: ["book"],
        async searchCoverCandidates() {
          return [baseCandidate];
        },
      },
      {
        code: "jikan",
        mediaTypes: ["anime"],
        async searchTitleCandidates() {
          throw new Error("provider is down");
        },
      },
    ] satisfies MediaProvider[];

    assert.deepEqual(
      getTitleProvidersForMediaType("book", titleProviders).map((provider) => provider.code),
      ["open-library"],
    );
    assert.deepEqual(
      await searchTitleCandidates(
        { mediaType: "book", query: " Dune " },
        titleProviders,
        customOptions,
      ),
      [
        {
          id: "work:/works/OL27448W",
          provider: "open-library",
          externalId: "/works/OL27448W",
          mediaType: "book",
          title: "Dune",
          originalTitle: null,
          description: null,
          coverUrl: null,
          sourcePageUrl: "https://openlibrary.org/works/OL27448W",
          releaseYear: 1965,
        },
      ],
    );
  });

  it("gets title metadata from provider detail capability", async () => {
    const metadataProviders = [
      {
        code: "tmdb",
        mediaTypes: ["film"],
        async getTitleMetadata(input) {
          return {
            provider: "tmdb",
            externalId: input.externalId,
            sourceUrl: "https://www.themoviedb.org/movie/1",
            facts: {
              runtimeMinutes: 136,
              emptyValue: null,
            },
          };
        },
      },
    ] satisfies MediaProvider[];

    assert.deepEqual(
      await getTitleMetadata(
        {
          provider: "tmdb",
          externalId: "1",
          mediaType: "film",
        },
        metadataProviders,
        {
          ...customOptions,
          providerCredentials: {
            tmdb: { accessToken: "test-token" },
          },
        },
      ),
      {
        provider: "tmdb",
        externalId: "1",
        sourceUrl: "https://www.themoviedb.org/movie/1",
        facts: {
          runtimeMinutes: 136,
        },
      },
    );
    assert.equal(
      await getTitleMetadata(
        {
          provider: "tmdb",
          externalId: "1",
          mediaType: "film",
        },
        metadataProviders,
        {
          ...customOptions,
          providerCredentials: {
            tmdb: { accessToken: "test-token" },
          },
          beforeProviderSearch: async () => false,
        },
      ),
      null,
    );
  });
});

describe("cover settings form", () => {
  it("parses cover settings limits into bytes", () => {
    assert.deepEqual(
      parseCoverSettingsFormInput({
        candidateLimit: "12",
        tmdbResultScanLimit: "4",
        coverMaxMegabytes: "7",
      }),
      {
        ok: true,
        value: {
          candidateLimit: 12,
          tmdbResultScanLimit: 4,
          coverMaxBytes: 7 * 1024 * 1024,
        },
      },
    );
  });

  it("rejects invalid cover settings limits", () => {
    assert.deepEqual(
      parseCoverSettingsFormInput({
        candidateLimit: "0",
        tmdbResultScanLimit: "4",
        coverMaxMegabytes: "7",
      }),
      { ok: false, error: "invalid-limit" },
    );
  });

  it("parses provider enabled flags and priorities", () => {
    const formData = new FormData();

    for (const [mediaType, providerCode] of [
      ["film", "tmdb"],
      ["series", "tmdb"],
      ["comic", "comic-vine"],
      ["book", "open-library"],
      ["book", "google-books"],
      ["game", "igdb"],
      ["game", "rawg"],
      ["anime", "jikan"],
      ["anime", "anilist"],
      ["anime", "tmdb"],
    ]) {
      const settingKey = `${mediaType}:${providerCode}`;

      formData.append("providerSettingKey", settingKey);
      formData.set(`providerPriority:${settingKey}`, "10");
    }

    formData.set("providerEnabled:film:tmdb", "1");

    const parsed = parseCoverProviderSettingsFormInput(formData);

    assert.equal(parsed.ok, true);
    assert.deepEqual(
      parsed.ok
        ? parsed.value.find(
            (provider) => provider.mediaType === "film" && provider.providerCode === "tmdb",
          )
        : null,
      { mediaType: "film", providerCode: "tmdb", enabled: true, priority: 10 },
    );
    assert.deepEqual(
      parsed.ok
        ? parsed.value.find(
            (provider) => provider.mediaType === "anime" && provider.providerCode === "anilist",
          )
        : null,
      { mediaType: "anime", providerCode: "anilist", enabled: false, priority: 10 },
    );
  });

  it("parses provider daily rate limits", () => {
    const formData = new FormData();

    for (const providerCode of [
      "tmdb",
      "comic-vine",
      "open-library",
      "google-books",
      "igdb",
      "rawg",
      "jikan",
      "anilist",
    ]) {
      formData.set(`providerSearchesPerDay:${providerCode}`, "1000");
    }

    const parsed = parseCoverProviderRateLimitsFormInput(formData);

    assert.equal(parsed.ok, true);
    assert.deepEqual(
      parsed.ok ? parsed.value.find((limit) => limit.providerCode === "anilist") : null,
      { providerCode: "anilist", searchesPerDay: 1000 },
    );
  });
});

describe("redis fixed-window rate limits", () => {
  it("builds stable fixed-window keys and retry-after values", () => {
    const now = new Date("2026-06-07T10:15:30.250Z");

    assert.equal(
      getFixedWindowRateLimitKey({
        keyPrefix: "cover-search:author",
        subject: "7",
        window: "minute",
        limit: 20,
        now,
      }),
      "cover-search:author:7:minute:1780827300000",
    );
    assert.equal(getFixedWindowRetryAfterSeconds({ now, window: "minute" }), 30);
    assert.equal(
      getFixedWindowRateLimitKey({
        keyPrefix: "auth:admin:identity",
        subject: "127.0.0.1:admin",
        window: "quarter-hour",
        limit: 5,
        now,
      }),
      "auth:admin:identity:127.0.0.1:admin:quarter-hour:1780827300000",
    );
    assert.equal(getFixedWindowRetryAfterSeconds({ now, window: "quarter-hour" }), 870);
  });

  it("increments counters and denies requests over the limit", async () => {
    const counts = new Map<string, number>();
    const ttls = new Map<string, number>();
    const fakeClient = {
      async expire(nextKey: string, seconds: number) {
        ttls.set(nextKey, seconds);
        return true;
      },
      multi() {
        let key = "";

        return {
          incr(nextKey: string) {
            key = nextKey;
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);

            return this;
          },
          ttl(nextKey: string) {
            key = nextKey;
            return this;
          },
          async exec() {
            return [counts.get(key) ?? 0, ttls.get(key) ?? -1];
          },
        };
      },
    };

    const first = await checkFixedWindowRateLimitWithClient(
      {
        keyPrefix: "cover-search:provider",
        subject: "tmdb",
        window: "day",
        limit: 1,
        now: new Date("2026-06-07T10:15:30.250Z"),
      },
      fakeClient,
    );
    const second = await checkFixedWindowRateLimitWithClient(
      {
        keyPrefix: "cover-search:provider",
        subject: "tmdb",
        window: "day",
        limit: 1,
        now: new Date("2026-06-07T10:15:31.250Z"),
      },
      fakeClient,
    );

    assert.equal(first.ok && first.allowed, true);
    assert.equal(second.ok && second.allowed, false);
  });
});

describe("cover provider credential validation", () => {
  it("validates TMDB credentials with a small authenticated request", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; authorization?: string }> = [];

    globalThis.fetch = async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("Authorization") ?? undefined,
      });

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    try {
      assert.deepEqual(
        await validateCoverProviderCredentials({
          providerCode: "tmdb",
          values: { accessToken: "test-token" },
        }),
        { ok: true },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.deepEqual(requests, [
      {
        url: "https://api.themoviedb.org/3/authentication",
        authorization: "Bearer test-token",
      },
    ]);
  });

  it("rejects credentials that the provider does not accept", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => new Response(JSON.stringify({ error: "bad key" }), { status: 403 });

    try {
      assert.deepEqual(
        await validateCoverProviderCredentials({
          providerCode: "google-books",
          values: { apiKey: "bad-key" },
        }),
        { ok: false, error: "invalid-credentials" },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("validates ComicVine credentials through API status code", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; userAgent?: string | null }> = [];

    globalThis.fetch = async (input, init) => {
      requests.push({
        url: String(input),
        userAgent: new Headers(init?.headers).get("User-Agent"),
      });

      return new Response(JSON.stringify({ status_code: 1 }), { status: 200 });
    };

    try {
      assert.deepEqual(
        await validateCoverProviderCredentials({
          providerCode: "comic-vine",
          values: { apiKey: "comic-key" },
        }),
        { ok: true },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.includes("api_key=comic-key"), true);
    assert.equal(requests[0].userAgent, "zadrotto/1.0 comic archive");
  });

  it("treats failed validation requests as provider unavailability", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      throw new Error("network down");
    };

    try {
      assert.deepEqual(
        await validateCoverProviderCredentials({
          providerCode: "rawg",
          values: { apiKey: "test-key" },
        }),
        { ok: false, error: "provider-unavailable" },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("validates IGDB credentials through Twitch token and IGDB probe", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];

    globalThis.fetch = async (input) => {
      const url = String(input);

      requests.push(url);

      if (url.startsWith("https://id.twitch.tv/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 });
      }

      return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
    };

    try {
      assert.deepEqual(
        await validateCoverProviderCredentials({
          providerCode: "igdb",
          values: { clientId: "client-id", clientSecret: "client-secret" },
        }),
        { ok: true },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(requests.length, 2);
    assert.equal(requests[0].startsWith("https://id.twitch.tv/oauth2/token"), true);
    assert.equal(requests[1], "https://api.igdb.com/v4/games");
  });
});

describe("cover storage helper", () => {
  it("keeps the cover file size limit explicit", () => {
    assert.equal(DEFAULT_COVER_MAX_BYTES, 5 * 1024 * 1024);
  });

  it("detects local S3 object keys", () => {
    assert.equal(isS3ObjectKey("covers/media-items/test.jpg"), true);
    assert.equal(isS3ObjectKey("https://example.com/test.jpg"), false);
    assert.equal(isS3ObjectKey(null), false);
  });

  it("builds cover thumbnail keys next to original cover keys", () => {
    assert.equal(
      buildCoverThumbObjectKey("covers/media-items/dune.jpg"),
      "covers/media-items/dune-thumb.webp",
    );
    assert.equal(buildCoverThumbObjectKey(null), null);
  });

  it("returns an empty manual source when no cover was selected", async () => {
    assert.deepEqual(
      await resolveCoverUpload({
        mediaItemCode: "dune",
        coverFile: null,
        candidateToken: null,
      }),
      {
        ok: true,
        coverUrl: null,
        coverThumbUrl: null,
        source: {
          provider: null,
          externalId: null,
          pageUrl: null,
        },
      },
    );
  });

  it("validates manual cover file input before uploading", async () => {
    const result = await uploadManualCover({
      mediaItemCode: "dune",
      coverFile: new File(["not an image"], "cover.gif", { type: "image/gif" }),
    });

    assert.deepEqual(result, { ok: false, error: "cover-type" });
  });

  it("validates manual cover file input against a runtime size limit", async () => {
    const result = await uploadManualCover({
      mediaItemCode: "dune",
      coverFile: new File(["not an image"], "cover.jpg", { type: "image/jpeg" }),
      maxBytes: 1,
    });

    assert.deepEqual(result, { ok: false, error: "cover-too-large" });
  });
});
