import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBggProvider, getBggQueryId, normalizeBggId, parseBggXml } from "@/lib/covers/providers/bgg";
import { BggRequestError, createBggRuntime, type BggRedis } from "@/lib/covers/providers/bgg-runtime";
import type { ProviderSearchOptions } from "@/lib/covers/types";
import { getTitleMetadata, searchCoverCandidates, searchTitleCandidates } from "@/lib/covers/registry";
import { runEditorialSummaryFlow } from "@/lib/media/editorial-summary-flow";

// Synthetic fixtures exercise our adapter; they do not establish live BGG search coverage.
const item = (id = "1", extra = "", type = "boardgame") => `<item id="${id}" type="${type}"><name type="primary" value="Game &amp; Friends"/><yearpublished value="2020"/>${extra}</item>`;
const xml = (...items: string[]) => `<items>${items.join("")}</items>`;
const options: ProviderSearchOptions = { candidateLimit: 2, tmdbResultScanLimit: 1, providerCredentials: { bgg: { accessToken: "secret" } } };
const metadataInput = { provider: "bgg", externalId: "1", mediaType: "boardgame" } as const;

function memoryRedis() {
  const values = new Map<string, string>();
  const writes: { key: string; options: unknown }[] = [];
  const evaluations: { script: string; arguments: string[] }[] = [];
  const redis = {
    async get(key: string) { return values.get(key) ?? null; },
    async set(key: string, value: string, opts: { NX?: boolean }) {
      writes.push({ key, options: opts });
      if (opts.NX && values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
    async eval(script: string, args: { keys: string[]; arguments: string[] }) {
      evaluations.push({ script, arguments: args.arguments });
      if (script.includes("DEL") && values.get(args.keys[0]) === args.arguments[0]) values.delete(args.keys[0]);
      return 0;
    },
  } as unknown as BggRedis;
  return { redis, values, writes, evaluations };
}
function setup(fetchImplementation: typeof fetch) {
  const store = memoryRedis();
  return { ...store, provider: createBggProvider({ fetch: fetchImplementation, runtime: createBggRuntime({ redis: async () => store.redis }) }) };
}
const response = (body: string) => new Response(body, { headers: { "content-type": "application/xml" } });

describe("BGG XML and identity", () => {
  it("accepts singleton, repeated, empty, Unicode, entities and CDATA", () => {
    assert.equal(parseBggXml(xml()).length, 0);
    assert.equal(parseBggXml(xml(item())).length, 1);
    const parsed = parseBggXml(xml(item("1", '<description><![CDATA[Крылья <birds>]]></description>'), item("2")));
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].description, "Крылья <birds>");
  });
  it("rejects DTD, entities, malformed XML, HTML and oversized responses", () => {
    for (const body of ['<!DOCTYPE items><items/>', '<!ENTITY x "hello"><items/>', "<items><item></items>", "<html><body>challenge</body></html>", xml("x".repeat(2 * 1024 * 1024))]) {
      assert.throws(() => parseBggXml(body), BggRequestError);
    }
  });
  it("only accepts positive safe IDs and exact HTTPS BGG boardgame links", () => {
    assert.equal(normalizeBggId("00012"), "12");
    for (const id of ["0", "-1", "1.5", "1e3", "9007199254740992", " 12"]) assert.equal(normalizeBggId(id), null);
    assert.equal(getBggQueryId("bgg:12"), "12");
    assert.equal(getBggQueryId("https://boardgamegeek.com/boardgame/12/name"), "12");
    for (const link of ["http://boardgamegeek.com/boardgame/12", "https://boardgamegeek.com.evil.test/boardgame/12", "https://user@boardgamegeek.com/boardgame/12", "https://boardgamegeek.com:444/boardgame/12", "https://evil.test/boardgame/12"]) assert.equal(getBggQueryId(link), null);
  });
});

describe("BGG adapter", () => {
  it("decodes numeric entities in category names and references", async () => {
    const { provider } = setup(async () => response(xml(item("1", '<link type="boardgamecategory" id="7" value="Children&#039;s Game"/><link type="boardgamemechanic" value="Pick &#x26; Pass"/>'))));
    const result = await provider.getTitleMetadata!(metadataInput, options);
    assert.deepEqual(result?.facts?.genres, ["Children's Game"]);
    assert.deepEqual(result?.facts?.genreReferences, [{ name: "Children's Game", id: "7" }]);
    assert.deepEqual(result?.facts?.mechanics, ["Pick & Pass"]);
  });
  it("validates revoked credentials against the API even when a card is cached", async () => {
    let calls = 0;
    const { provider } = setup(async () => ++calls === 1 ? response(xml(item())) : new Response(null, { status: 401 }));
    await provider.getTitleMetadata!(metadataInput, options);
    await provider.getTitleMetadata!(metadataInput, options);
    assert.equal(calls, 1);
    await assert.rejects(provider.getTitleMetadata!(metadataInput, { ...options, bypassCache: true }), (error) => error instanceof BggRequestError && error.invalidCredentials && error.status === 401);
    assert.equal(calls, 2);
  });
  it("maps metadata without mixing mechanics and categories; keeps only Cyrillic aliases", async () => {
    const fixture = item("1", `<name type="alternate" value="Other"/><name type="alternate" value="Крылья"/><name type="alternate" value="крылья"/><name type="alternate" value="Autre"/><name type="alternate" value="Altro"/><description><![CDATA[Birds & friends]]></description><minplayers value="1"/><maxplayers value="5"/><playingtime value="60"/><minplaytime value="40"/><maxplaytime value="70"/><minage value="10"/><link type="boardgamedesigner" value="Designer"/><link type="boardgameartist" value="Artist"/><link type="boardgamepublisher" value="Publisher"/><link type="boardgamecategory" id="7" value="Animals"/><link type="boardgamemechanic" id="8" value="Drafting"/>`, "boardgameexpansion");
    const { provider } = setup(async () => response(xml(fixture)));
    const result = await provider.getTitleMetadata!(metadataInput, options);
    assert.equal(result?.fields?.title, "Game & Friends");
    assert.equal(result?.fields?.description, "Birds & friends");
    assert.deepEqual(result?.fields?.aliases, ["Крылья"]);
    assert.deepEqual(result?.facts, { bggItemType: "boardgameexpansion", authors: ["Designer"], artists: ["Artist"], publishers: ["Publisher"], mechanics: ["Drafting"], genres: ["Animals"], genreReferences: [{ name: "Animals", id: "7" }], minPlayers: 1, maxPlayers: 5, runtimeMinutes: 60, minPlayingTimeMinutes: 40, maxPlayingTimeMinutes: 70, minAge: 10 });
    assert.equal(JSON.stringify(result).includes("secret"), false);
  });
  it("treats zero year and absent optional fields as missing", async () => {
    const { provider } = setup(async () => response(xml('<item id="1" type="boardgame"><name type="primary" value="Game"/><yearpublished value="0"/></item>')));
    const result = await provider.getTitleMetadata!(metadataInput, options);
    assert.equal(result?.fields?.releaseYear, null);
    assert.equal(result?.fields?.description, null);
    assert.equal(result?.facts.minPlayers, null);
    assert.deepEqual(result?.fields?.aliases, []);
    assert.equal(Object.hasOwn(result!.facts, "alternateNames"), false);
  });
  it("batches search enrichment, matches aliases and caches individual cards", async () => {
    const requests: URL[] = [];
    const { provider } = setup(async (input, init) => {
      const url = new URL(String(input)); requests.push(url);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer secret");
      assert.equal(url.origin, "https://boardgamegeek.com");
      assert.equal(url.searchParams.get("type"), "boardgame,boardgameexpansion");
      return response(url.pathname.endsWith("/search") ? xml(item("1"), item("2"), item("3")) : xml(item("1", '<name type="alternate" value="Крылья"/><image>https://cf.geekdo-images.com/cover.png</image>', "boardgameexpansion"), item("2")));
    });
    const result = await provider.searchTitleCandidates!({ query: "Крылья", mediaType: "boardgame" }, options);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].searchParams.get("query"), "Крылья");
    assert.equal(requests[1].searchParams.get("id"), "1,2");
    assert.equal(result[0].subtitle, "Крылья · Дополнение");
    assert.equal(result[0].coverUrl, "https://cf.geekdo-images.com/cover.png");
    assert.equal(result[1].coverUrl, null);
    await provider.getTitleMetadata!(metadataInput, options);
    assert.equal(requests.length, 2);
  });
  it("keeps search results if enrichment fails and rejects unexpected card IDs", async () => {
    const { provider } = setup(async (input) => String(input).includes("/search?") ? response(xml(item())) : response(xml(item("99"))));
    const result = await provider.searchTitleCandidates!({ query: "Game", mediaType: "boardgame" }, options);
    assert.equal(result[0].externalId, "1");
    assert.equal(result[0].coverUrl, null);
    await assert.rejects(provider.getTitleMetadata!(metadataInput, options), BggRequestError);
  });
  it("never fetches arbitrary URLs or invalid direct IDs", async () => {
    let calls = 0;
    const { provider } = setup(async () => { calls++; return response(xml(item())); });
    for (const query of ["https://evil.test/boardgame/1", "bgg:0"]) assert.deepEqual(await provider.searchTitleCandidates!({ query, mediaType: "boardgame" }, options), []);
    assert.equal(calls, 0);
    await provider.searchTitleCandidates!({ query: "bgg:1", mediaType: "boardgame" }, options);
    assert.equal(calls, 1);
  });
  it("rejects unsupported item types and unsafe images, with thumbnail fallback", async () => {
    const wrongType = setup(async () => response(xml(item("1", "", "rpgitem"))));
    await assert.rejects(wrongType.provider.getTitleMetadata!(metadataInput, options), BggRequestError);
    const { provider } = setup(async () => response(xml(item("1", '<image>https://evil.test/cover.png</image><thumbnail>https://cf.geekdo-images.com/thumb.png</thumbnail>'))));
    const covers = await provider.getCoverCandidatesByTitleSource!({ mediaType: "boardgame", title: "Game", originalTitle: null, releaseYear: null, titleSource: metadataInput }, options);
    assert.equal(covers[0].imageUrl, "https://cf.geekdo-images.com/thumb.png");
    const noCover = setup(async () => response(xml(item("1", '<image>http://cf.geekdo-images.com/cover.png</image>'))));
    assert.deepEqual(await noCover.provider.getCoverCandidatesByTitleSource!({ mediaType: "boardgame", title: "Game", originalTitle: null, releaseYear: null, titleSource: metadataInput }, options), []);
  });
  it("classifies credentials, HTML challenges and retryable statuses without retrying", async () => {
    for (const [status, contentType, invalidCredentials] of [[401, "application/xml", true], [403, "text/html", false], [403, "application/xml", true], [429, "application/xml", false], [202, "application/xml", false], [503, "application/xml", false]] as const) {
      let calls = 0;
      const { provider, evaluations } = setup(async () => { calls++; return new Response("challenge", { status, headers: { "content-type": contentType, "retry-after": "12" } }); });
      await assert.rejects(provider.getTitleMetadata!(metadataInput, options), (error) => error instanceof BggRequestError && error.status === status && error.invalidCredentials === invalidCredentials && error.code === (status === 429 ? "provider-rate-limit" : "provider-unavailable") && !error.message.includes("secret"));
      assert.equal(calls, 1);
      if ([202, 429, 503].includes(status)) assert.ok(evaluations.some((entry) => entry.arguments[0] === "12000"));
    }
  });
  it("fails closed without Redis and aborts active HTTP requests", async () => {
    let calls = 0;
    const unavailable = createBggProvider({ runtime: createBggRuntime({ redis: async () => null }), fetch: async () => { calls++; return response(xml()); } });
    await assert.rejects(unavailable.getTitleMetadata!(metadataInput, options), (error) => error instanceof BggRequestError && error.code === "rate-limit-unavailable");
    assert.equal(calls, 0);
    const { provider } = setup(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      if (signal?.aborted) reject(signal.reason);
    }));
    const keepAlive = setTimeout(() => {}, 100);
    try { await assert.rejects(provider.getTitleMetadata!(metadataInput, { ...options, requestTimeoutMs: 5 })); }
    finally { clearTimeout(keepAlive); }
  });
});

describe("BGG Redis cache", () => {
  it("bounds a hanging Redis connection by the operation deadline", async () => {
    const runtime = createBggRuntime({ redis: () => new Promise(() => {}) });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("deadline")), 5);
    try {
      await assert.rejects(runtime.cached("secret", "thing:1", 60, controller.signal, async () => []), /deadline/);
    } finally { clearTimeout(timer); }
  });
  it("rejects already aborted operations before touching Redis", async () => {
    let calls = 0;
    const runtime = createBggRuntime({ redis: async () => { calls++; return memoryRedis().redis; } });
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await assert.rejects(runtime.waitForRequest(controller.signal), /cancelled/);
    await assert.rejects(runtime.cached("secret", "thing:1", 60, controller.signal, async () => []), /cancelled/);
    assert.equal(calls, 0);
  });
  it("aborts while waiting for a shared request slot", async () => {
    const redis = { ...memoryRedis().redis, async eval() { return 5000; } } as unknown as BggRedis;
    const runtime = createBggRuntime({ redis: async () => redis });
    const controller = new AbortController();
    const pending = runtime.waitForRequest(controller.signal);
    setTimeout(() => controller.abort(), 5);
    await assert.rejects(pending, (error) => error instanceof Error && error.name === "AbortError");
  });
  it("coalesces requests, persists TTL, isolates credentials and does not cache failures", async () => {
    const { redis, writes } = memoryRedis();
    const runtime = createBggRuntime({ redis: async () => redis });
    const signal = AbortSignal.timeout(1000);
    let loads = 0;
    const load = async () => { loads++; return ["card"]; };
    assert.deepEqual(await Promise.all([runtime.cached("secret", "thing:1", 86400, signal, load), runtime.cached("secret", "thing:1", 86400, signal, load)]), [["card"], ["card"]]);
    await runtime.cached("secret", "thing:1", 86400, signal, load);
    assert.equal(loads, 1);
    await runtime.cached("changed", "thing:1", 86400, signal, load);
    assert.equal(loads, 2);
    assert.ok(writes.some((entry) => JSON.stringify(entry.options) === '{"EX":86400}'));
    assert.ok(writes.every((entry) => !entry.key.includes("secret") && !entry.key.includes("changed")));
    for (let index = 0; index < 2; index++) await assert.rejects(runtime.cached("secret", "failure", 60, signal, async () => { loads++; throw new BggRequestError("provider-unavailable"); }));
    assert.equal(loads, 4);
  });
});

describe("BGG integration safeguards", () => {
  it("propagates provider Retry-After through every registry discovery path", async () => {
    const fail = async (): Promise<never> => { throw new BggRequestError("provider-rate-limit", 429, 3600); };
    const provider = { code: "bgg", mediaTypes: ["boardgame"], searchTitleCandidates: fail, searchCoverCandidates: fail, getCoverCandidatesByTitleSource: fail, getTitleMetadata: fail } as const;
    for (const titleSearchMode of ["parallel", "fallback"] as const) {
      const settings = [{ mediaType: "boardgame", providerCode: "bgg", enabled: true, coverSearchEnabled: true, titleSearchMode, priority: 0 }] as const;
      const title = await searchTitleCandidates({ query: "Carcassonne", mediaType: "boardgame" }, [provider], options, settings);
      assert.equal(title.error, "provider-rate-limit");
      assert.equal(title.retryAfterSeconds, 3600);
      for (const titleSource of [null, metadataInput]) {
        const covers = await searchCoverCandidates({ title: "Carcassonne", originalTitle: null, releaseYear: null, mediaType: "boardgame", titleSource }, [provider], options, settings);
        assert.equal(covers.error, "provider-rate-limit");
        assert.equal(covers.retryAfterSeconds, 3600);
      }
      const metadata = await getTitleMetadata(metadataInput, [provider], options, settings);
      assert.equal(metadata.error, "provider-rate-limit");
      assert.equal(metadata.retryAfterSeconds, 3600);
    }
  });
  it("never generates or saves an AI summary for BGG even when forced", async () => {
    let calls = 0;
    const result = await runEditorialSummaryFlow({ mediaItemId: 1, source: { sourceProvider: "bgg", title: "Game", originalTitle: null, mediaType: "boardgame", releaseYear: 2020, description: "English description", metadataFacts: null, locked: false, sourceHash: null }, prompt: "Summarize", force: true, generate: async () => { calls++; throw new Error("must not generate"); }, save: async () => { calls++; return true; } });
    assert.equal(result, "provider-restricted");
    assert.equal(calls, 0);
  });
});
