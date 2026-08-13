import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RobloxProviderError,
  RobloxSearchAdapter,
} from "@/lib/covers/providers/roblox-search-adapter";
import { createRobloxProvider } from "@/lib/covers/providers/roblox";
import type { CoverSearchOptions } from "@/lib/covers/types";

const options = {
  candidateLimit: 3,
  tmdbResultScanLimit: 1,
} satisfies CoverSearchOptions;

const searchFixture = {
  searchResults: [
    {
      contentGroupType: "Game",
      contents: [
        {
          universeId: 1686885941,
          rootPlaceId: 4924922222,
          name: "Brookhaven 🏡RP",
          creatorId: 3104358,
          creatorName: "Brookhaven by Voldex",
          canonicalUrlPath: "/games/4924922222/Brookhaven-RP",
        },
        { universeId: 0, name: "Invalid" },
        { universeId: 1686885941, name: "Duplicate" },
      ],
    },
    { contentGroupType: "Avatar", contents: [{ universeId: 99, name: "Not a game" }] },
    {
      contentGroupType: "Game",
      contents: [{ universeId: 994732206, rootPlaceId: 2753915549, name: "Blox Fruits" }],
    },
  ],
  nextPageToken: "opaque-token",
};

describe("RobloxSearchAdapter", () => {
  it("sends the public search contract and extracts unique Experience candidates", async () => {
    const requested: URL[] = [];
    const adapter = new RobloxSearchAdapter({
      createSessionId: () => "session-id",
      fetch: async (input) => {
        requested.push(new URL(String(input)));
        return Response.json(searchFixture);
      },
    });

    const candidates = await adapter.search("  Brookhaven   RP ", 10);

    assert.deepEqual(candidates, [
      {
        universeId: 1686885941,
        rootPlaceId: 4924922222,
        name: "Brookhaven 🏡RP",
        creatorId: 3104358,
        creatorName: "Brookhaven by Voldex",
        canonicalUrlPath: "/games/4924922222/Brookhaven-RP",
      },
      {
        universeId: 994732206,
        rootPlaceId: 2753915549,
        name: "Blox Fruits",
        creatorId: null,
        creatorName: null,
        canonicalUrlPath: null,
      },
    ]);
    assert.equal(requested[0]?.searchParams.get("searchQuery"), "Brookhaven RP");
    assert.equal(requested[0]?.searchParams.get("sessionId"), "session-id");
    assert.equal(requested[0]?.searchParams.get("pageType"), "all");
  });

  it("caches completed searches and joins identical in-flight requests", async () => {
    let calls = 0;
    let resolveResponse!: (response: Response) => void;
    const adapter = new RobloxSearchAdapter({
      fetch: async () => {
        calls += 1;
        return new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        });
      },
    });

    const first = adapter.search("Blox Fruits", 2);
    const second = adapter.search("Blox Fruits", 2);
    await Promise.resolve();
    assert.equal(calls, 1);
    resolveResponse(Response.json(searchFixture));
    assert.deepEqual(await first, await second);
    await adapter.search("Blox Fruits", 2);
    assert.equal(calls, 1);
  });

  it("enters a Retry-After cooldown after 429 without another request", async () => {
    let calls = 0;
    let now = 1_000;
    const adapter = new RobloxSearchAdapter({
      now: () => now,
      fetch: async () => {
        calls += 1;
        return new Response(null, { status: 429, headers: { "retry-after": "12" } });
      },
    });

    await assert.rejects(
      adapter.search("DOORS", 3),
      (error) => error instanceof RobloxProviderError
        && error.code === "provider-rate-limit"
        && error.retryAfterSeconds === 12,
    );
    now += 2_000;
    await assert.rejects(
      adapter.search("another query", 3),
      (error) => error instanceof RobloxProviderError
        && error.code === "provider-rate-limit"
        && error.retryAfterSeconds === 10,
    );
    assert.equal(calls, 1);
  });

  it("classifies 5xx, malformed responses, and timeouts", async () => {
    for (const [fetchImplementation, code] of [
      [async () => new Response(null, { status: 503 }), "provider-unavailable"],
      [async () => Response.json({ unexpected: [] }), "provider-invalid-response"],
      [async () => new Response("not-json", { headers: { "content-type": "application/json" } }), "provider-invalid-response"],
    ] as const) {
      const adapter = new RobloxSearchAdapter({ fetch: fetchImplementation });
      await assert.rejects(
        adapter.search(`query-${code}-${Math.random()}`, 2),
        (error) => error instanceof RobloxProviderError && error.code === code,
      );
    }

    const adapter = new RobloxSearchAdapter({
      timeoutMs: 1,
      fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    });
    await assert.rejects(
      adapter.search("timeout", 2),
      (error) => error instanceof RobloxProviderError && error.code === "provider-timeout",
    );
  });
});

describe("Roblox provider", () => {
  it("maps search candidates and enriches them with optional icons", async () => {
    const provider = createRobloxProvider({
      searchAdapter: { async search() { return [
        {
          universeId: 4924922222,
          rootPlaceId: 142823291,
          name: "Brookhaven 🏡RP",
          creatorId: 72198020,
          creatorName: "Wolfpaq",
          canonicalUrlPath: "/games/142823291/Brookhaven-RP",
        },
      ]; } },
      fetch: async () => Response.json({ data: [
        { targetId: 4924922222, state: "Completed", imageUrl: "https://tr.rbxcdn.com/icon.png" },
      ] }),
    });

    assert.deepEqual(
      await provider.searchTitleCandidates?.({ mediaType: "roblox", query: "Brookhaven" }, options),
      [{
        id: "universe:4924922222",
        provider: "roblox",
        externalId: "4924922222",
        mediaType: "roblox",
        title: "Brookhaven 🏡RP",
        originalTitle: null,
        description: null,
        coverUrl: "https://tr.rbxcdn.com/icon.png",
        sourcePageUrl: "https://www.roblox.com/games/142823291/Brookhaven-RP",
        releaseYear: null,
        subtitle: "Wolfpaq",
      }],
    );
  });

  it("uses Universe identity and keeps creation separate from release date", async () => {
    const provider = createRobloxProvider({ fetch: async () => Response.json({ data: [{
      id: 4924922222,
      rootPlaceId: 142823291,
      name: " Brookhaven 🏡RP ",
      description: " A role-playing experience. ",
      creator: { id: 72198020, name: "Wolfpaq", type: "Group" },
      created: "2020-04-21T15:42:31.62Z",
      updated: "2026-08-12T10:00:00Z",
      genre: "Town and City",
      genre_l1: "Roleplay & Avatar Sim",
      genre_l2: "Life",
    }] }) });

    assert.deepEqual(
      await provider.getTitleMetadata?.(
        { provider: "roblox", externalId: "4924922222", mediaType: "roblox" },
        options,
      ),
      {
        provider: "roblox",
        externalId: "4924922222",
        sourceUrl: "https://www.roblox.com/games/142823291",
        fields: {
          title: "Brookhaven 🏡RP",
          originalTitle: null,
          description: "A role-playing experience.",
          releaseYear: null,
        },
        facts: {
          universeId: 4924922222,
          rootPlaceId: 142823291,
          creatorId: 72198020,
          creatorName: "Wolfpaq",
          creatorType: "Group",
          createdAt: "2020-04-21T15:42:31.62Z",
          updatedAt: "2026-08-12T10:00:00Z",
          genre: "Town and City",
          genreLevel1: "Roleplay & Avatar Sim",
          genreLevel2: "Life",
        },
      },
    );
  });

  it("returns an icon and wide game thumbnails from official endpoints", async () => {
    const requested: URL[] = [];
    const provider = createRobloxProvider({ fetch: async (input) => {
      const url = new URL(String(input));
      requested.push(url);
      if (url.hostname === "games.roblox.com") return Response.json({ data: [
        { id: 4924922222, rootPlaceId: 142823291, name: "Brookhaven 🏡RP" },
      ] });
      if (url.pathname.endsWith("/icons")) return Response.json({ data: [
        { targetId: 4924922222, state: "Completed", imageUrl: "https://tr.rbxcdn.com/icon.png", version: "v1" },
      ] });
      return Response.json({ data: [{ universeId: 4924922222, thumbnails: [
        { targetId: 1, state: "Completed", imageUrl: "https://tr.rbxcdn.com/wide1.png", version: "v2" },
        { targetId: 2, state: "Pending", imageUrl: "https://tr.rbxcdn.com/pending.png" },
        { targetId: 3, state: "Completed", imageUrl: "https://tr.rbxcdn.com/wide2.png" },
      ] }] });
    } });

    const covers = await provider.getCoverCandidatesByTitleSource?.(
      {
        mediaType: "roblox",
        title: "Brookhaven",
        originalTitle: null,
        releaseYear: null,
        titleSource: { provider: "roblox", externalId: "4924922222" },
      },
      options,
    );

    assert.equal(covers?.length, 3);
    assert.deepEqual(covers?.map((cover) => [cover.imageUrl, cover.width, cover.height]), [
      ["https://tr.rbxcdn.com/icon.png", 512, 512],
      ["https://tr.rbxcdn.com/wide1.png", 768, 432],
      ["https://tr.rbxcdn.com/wide2.png", 768, 432],
    ]);
    assert.equal(requested.find((url) => url.pathname.includes("multiget"))?.searchParams.get("countPerUniverse"), "3");
  });
});
