import assert from "node:assert/strict";
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
import { getCoverProvidersForMediaType, searchCoverCandidates } from "@/lib/covers/registry";
import {
  buildCoverThumbObjectKey,
  isS3ObjectKey,
  resolveCoverUpload,
  uploadManualCover,
} from "@/lib/covers/storage";
import type { CoverCandidate, CoverProvider, CoverSearchOptions } from "@/lib/covers/types";
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
      ["book", "open-library"],
      ["book", "google-books"],
      ["game", "igdb"],
      ["game", "rawg"],
      ["anime", "jikan"],
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
            (provider) => provider.mediaType === "game" && provider.providerCode === "rawg",
          )
        : null,
      { mediaType: "game", providerCode: "rawg", enabled: false, priority: 10 },
    );
  });

  it("parses provider daily rate limits", () => {
    const formData = new FormData();

    for (const providerCode of [
      "tmdb",
      "open-library",
      "google-books",
      "igdb",
      "rawg",
      "jikan",
    ]) {
      formData.set(`providerSearchesPerDay:${providerCode}`, "1000");
    }

    const parsed = parseCoverProviderRateLimitsFormInput(formData);

    assert.equal(parsed.ok, true);
    assert.deepEqual(
      parsed.ok ? parsed.value.find((limit) => limit.providerCode === "tmdb") : null,
      { providerCode: "tmdb", searchesPerDay: 1000 },
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
  });

  it("increments counters and denies requests over the limit", async () => {
    const counts = new Map<string, number>();
    const fakeClient = {
      multi() {
        let key = "";

        return {
          incr(nextKey: string) {
            key = nextKey;
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);

            return this;
          },
          expire() {
            return this;
          },
          async exec() {
            return [counts.get(key) ?? 0, true];
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
