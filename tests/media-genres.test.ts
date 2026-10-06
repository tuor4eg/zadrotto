import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { extractExternalGenres, getProviderGenreReferences, resolveGenreMappings, type GenreMapping } from "../src/lib/media/genres";
import { formatMediaItemSummary } from "../src/lib/media/media-item-summary";
import { MediaMetadataFacts } from "../src/components/ui/media-metadata-facts";
import { createMediaMetadataCandidateToken, verifyMediaMetadataCandidateToken } from "../src/lib/media/metadata-candidates";
import { createTmdbProvider } from "../src/lib/covers/providers/tmdb";
import { igdbProvider } from "../src/lib/covers/providers/igdb";
import { rawgProvider } from "../src/lib/covers/providers/rawg";

describe("provider genres", () => {
  it("normalizes names, deduplicates, and never splits compound names", () => {
    assert.deepEqual(extractExternalGenres({ genres: ["  БОЕВИК  ", "боевик", "НФ и Фэнтези", "Hack and slash/Beat 'em up", "Card & Board Game", " "] }).map((g) => g.normalizedName),
      ["боевик", "нф и фэнтези", "hack and slash/beat 'em up", "card & board game"]);
    assert.equal(extractExternalGenres({ genres: "  Ёж   и\tЕль  " })[0].normalizedName, "еж и ель");
    assert.equal(extractExternalGenres({ genres: "Drama | Comedy" }).length, 1);
    assert.deepEqual(extractExternalGenres({ genres: null }), []);
    assert.deepEqual(extractExternalGenres({}), []);
  });

  it("rejects malformed genres and ambiguous or unmatched references", () => {
    for (const genres of [42, {}, ["Drama", null]]) assert.throws(() => extractExternalGenres({ genres }));
    for (const genreReferences of [null, [{}], [{ id: "", name: "Drama" }], [{ id: "1", name: "Comedy" }], [{ id: "1", name: "Drama" }, { id: "2", name: "Drama" }]]) {
      assert.throws(() => extractExternalGenres({ genres: ["Drama"], genreReferences }));
    }
    assert.equal(extractExternalGenres({ genres: ["Drama"], genreReferences: [{ id: " 1 ", name: " DRAMA " }] })[0].id, "1");
  });

  it("expands 1→N, deduplicates, uses IDs before names, and hides inactive matches", () => {
    const mapping = (id: number, slug: string, externalGenreId: string | null, isActive = true): GenreMapping => ({
      externalGenreId, normalizedExternalGenreName: "compound", genre: { id, slug, name: slug }, isActive,
    });
    const mappings = [mapping(1, "war", "9"), mapping(2, "politics", "9"), mapping(3, "other", null), mapping(4, "inactive", "9", false)];
    const resolved = resolveGenreMappings({ provider: "tmdb", mediaType: "series", mappings,
      externalGenres: extractExternalGenres({ genres: ["compound", "Renamed", "Unknown"], genreReferences: [{ id: "9", name: "compound" }, { id: "9", name: "Renamed" }] }),
    });
    assert.deepEqual(resolved.genres.map((g) => g.slug), ["politics", "war"]);
    assert.equal(resolved.unmapped[0].name, "Unknown");
    const fallback = resolveGenreMappings({ provider: "tmdb", mediaType: "series", mappings,
      externalGenres: extractExternalGenres({ genres: ["compound"], genreReferences: [{ id: "missing", name: "compound" }] }),
    });
    assert.deepEqual(fallback.genres.map((g) => g.slug), ["other", "politics", "war"]);
  });

  it("excludes TV movies only for TMDB film and keeps unknown genres out of the dictionary", () => {
    const externalGenres = extractExternalGenres({ genres: ["Телевизионный фильм", "TV Movie"] });
    assert.deepEqual(resolveGenreMappings({ provider: "tmdb", mediaType: "film", mappings: [], externalGenres }), { genres: [], unmapped: [] });
    assert.equal(resolveGenreMappings({ provider: "tmdb", mediaType: "series", mappings: [], externalGenres }).unmapped.length, 2);
    assert.deepEqual(getProviderGenreReferences([{ id: 4, name: " Drama " }, { name: "Comedy" }, { id: -1, name: "X" }]), [{ id: "4", name: "Drama" }]);
  });
});

describe("normalized genre rendering", () => {
  it("never falls back to raw genres and renders the entire internal list", () => {
    const item = { mediaType: "game", mediaTypeLabel: "Игра", releaseYear: null, metadataFacts: { genres: ["RAW"] } };
    assert.equal(formatMediaItemSummary(item), "Игра");
    assert.equal(formatMediaItemSummary({ ...item, genres: ["А", "Б", "В", "Г"].map((name, id) => ({ id, name, slug: String(id) })) }), "Игра · А, Б, В, Г");
  });
  it("suppresses raw genre fields in the facts component and uses plain internal names", () => {
    const metadata = { facts: { genres: ["RAW"], genreReferences: [{ id: "9", name: "RAW" }], genre: "RAW", genreLevel1: "RAW", genreLevel2: "RAW", creatorName: "Creator" }, sourceProvider: null, sourceExternalId: null, sourceUrl: null };
    const html = renderToStaticMarkup(createElement(MediaMetadataFacts, { metadata, genres: [{ id: 1, slug: "comedy", name: "Комедия" }] }));
    assert.doesNotMatch(html, /RAW|genreReferences|<a/);
    assert.match(html, /Комедия/);
    assert.match(html, /Creator/);
    const empty = renderToStaticMarkup(createElement(MediaMetadataFacts, { metadata: { ...metadata, facts: { genres: ["RAW"] } } }));
    assert.equal(empty, "");
  });
});

it("accepts old signed metadata and valid references, rejects malformed signed references", () => {
  const previousSecret = process.env.MEDIA_METADATA_CANDIDATE_SECRET;
  process.env.MEDIA_METADATA_CANDIDATE_SECRET = "genre-test-secret";
  try {
    const candidate = { provider: "tmdb" as const, externalId: "1", mediaType: "film" as const, sourceUrl: null, facts: { genres: ["Drama"] } as Record<string, unknown> };
    assert.ok(verifyMediaMetadataCandidateToken(createMediaMetadataCandidateToken(candidate)));
    candidate.facts.genreReferences = [{ id: "18", name: "Drama" }];
    assert.ok(verifyMediaMetadataCandidateToken(createMediaMetadataCandidateToken(candidate)));
    candidate.facts.genreReferences = [{ id: 18, name: "Drama" }];
    assert.equal(verifyMediaMetadataCandidateToken(createMediaMetadataCandidateToken(candidate)), null);
  } finally {
    if (previousSecret === undefined) delete process.env.MEDIA_METADATA_CANDIDATE_SECRET;
    else process.env.MEDIA_METADATA_CANDIDATE_SECRET = previousSecret;
  }
});

it("TMDB, IGDB and RAWG preserve genre IDs from the existing metadata request", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("oauth2/token")) return Response.json({ access_token: "genre-test-token", expires_in: 3600 });
    const payload = { id: 1, genres: [{ id: 9, name: "Adventure" }] };
    return Response.json(url.includes("igdb.com") ? [payload] : payload);
  };
  try {
    const options = { candidateLimit: 5, tmdbResultScanLimit: 10, providerCredentials: {
      tmdb: { accessToken: "test" }, igdb: { clientId: "genre-test", clientSecret: "test" }, rawg: { apiKey: "test" },
    } };
    for (const [provider, mediaType] of [[createTmdbProvider("film"), "film"], [igdbProvider, "game"], [rawgProvider, "game"]] as const) {
      const result = await provider.getTitleMetadata!({ provider: provider.code, externalId: "1", mediaType }, options);
      assert.deepEqual(result?.facts.genres, ["Adventure"]);
      assert.deepEqual(result?.facts.genreReferences, [{ id: "9", name: "Adventure" }]);
    }
    assert.equal(requests.filter((url) => !url.includes("oauth2/token")).length, 3);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
