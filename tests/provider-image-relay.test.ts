import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  createProviderImageToken,
  fetchProviderImage,
  getProviderImageRelayUrl,
  isSafeProviderImageUrl,
  verifyProviderImageToken,
} from "@/lib/covers/provider-image-relay";
import { checkProviderImageRelayRateLimit } from "@/lib/covers/rate-limits";

const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
});

describe("provider image relay tokens", () => {
  it("signs a short-lived token containing the original provider image URL", () => {
    process.env.PROVIDER_IMAGE_RELAY_SECRET = "provider-image-test-secret";
    const issuedAt = 1_700_000_000_000;
    Date.now = () => issuedAt;

    const imageUrl = "https://image.tmdb.org/t/p/w500/poster.jpg";
    const token = createProviderImageToken("tmdb", imageUrl);

    assert.ok(token);
    assert.deepEqual(verifyProviderImageToken(token), {
      providerCode: "tmdb",
      imageUrl,
      exp: issuedAt / 1000 + 5 * 60,
    });
    assert.match(getProviderImageRelayUrl("tmdb", imageUrl), /^\/api\/provider-image\?token=/);
  });

  it("rejects tampered and expired tokens", () => {
    process.env.PROVIDER_IMAGE_RELAY_SECRET = "provider-image-test-secret";
    const issuedAt = 1_700_000_000_000;
    Date.now = () => issuedAt;
    const token = createProviderImageToken("rawg", "https://media.rawg.io/media/games/game.jpg");

    assert.ok(token);
    assert.equal(verifyProviderImageToken(`${token}x`), null);

    Date.now = () => issuedAt + 5 * 60 * 1000;
    assert.equal(verifyProviderImageToken(token), null);
  });
});

describe("provider image URL allowlist", () => {
  it("accepts only HTTPS URLs on the selected provider hosts", () => {
    assert.equal(
      isSafeProviderImageUrl("google-books", "https://books.googleusercontent.com/books/content?id=1"),
      true,
    );
    assert.equal(
      isSafeProviderImageUrl("google-books", "https://lh3.googleusercontent.com/books/content?id=1"),
      true,
    );
    assert.equal(
      isSafeProviderImageUrl("tmdb", "https://media.rawg.io/media/games/game.jpg"),
      false,
    );
  });

  it("rejects unsafe URL forms and leaves them unproxied", () => {
    const unsafeUrls = [
      "http://image.tmdb.org/t/p/w500/poster.jpg",
      "https://image.tmdb.org.evil.test/poster.jpg",
      "https://user:password@image.tmdb.org/poster.jpg",
      "https://image.tmdb.org:8443/poster.jpg",
      "not a url",
    ];

    for (const imageUrl of unsafeUrls) {
      assert.equal(isSafeProviderImageUrl("tmdb", imageUrl), false);
      assert.equal(createProviderImageToken("tmdb", imageUrl), null);
      assert.equal(getProviderImageRelayUrl("tmdb", imageUrl), imageUrl);
    }
  });
});

describe("bounded provider image fetch", () => {
  it("returns supported image bytes and forbids redirects", async () => {
    let redirect: RequestRedirect | undefined;
    globalThis.fetch = async (_input, init) => {
      redirect = init?.redirect;
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/webp; charset=binary", "content-length": "3" },
      });
    };

    const result = await fetchProviderImage({
      providerCode: "rawg",
      imageUrl: "https://media.rawg.io/media/games/game.webp",
      maxBytes: 3,
    });

    assert.equal(redirect, "error");
    assert.deepEqual(result, {
      ok: true,
      body: Buffer.from([1, 2, 3]),
      contentType: "image/webp",
    });
  });

  it("rejects unsupported content types", async () => {
    globalThis.fetch = async () => new Response("<svg/>", {
      headers: { "content-type": "image/svg+xml" },
    });

    assert.deepEqual(await fetchProviderImage({
      providerCode: "jikan",
      imageUrl: "https://cdn.myanimelist.net/images/anime/1.svg",
      maxBytes: 100,
    }), { ok: false, error: "unsupported-type" });
  });

  it("rejects declared and streamed bodies over the configured limit", async () => {
    globalThis.fetch = async () => new Response(new Uint8Array([1]), {
      headers: { "content-type": "image/jpeg", "content-length": "101" },
    });
    assert.deepEqual(await fetchProviderImage({
      providerCode: "tmdb",
      imageUrl: "https://image.tmdb.org/t/p/original/poster.jpg",
      maxBytes: 100,
    }), { ok: false, error: "too-large" });

    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { "content-type": "image/png" },
    });
    assert.deepEqual(await fetchProviderImage({
      providerCode: "open-library",
      imageUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
      maxBytes: 3,
    }), { ok: false, error: "too-large" });
  });

  it("maps redirects and upstream failures to unavailable without following them", async () => {
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.redirect, "error");
      throw new TypeError("redirect blocked");
    };

    assert.deepEqual(await fetchProviderImage({
      providerCode: "igdb",
      imageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/id.jpg",
      maxBytes: 100,
    }), { ok: false, error: "unavailable" });
  });
});

describe("provider image relay rate limit", () => {
  it("uses an actor-specific fixed window of 60 requests per minute", async () => {
    let checkedInput: unknown;
    const result = await checkProviderImageRelayRateLimit("author:42", async (input) => {
      checkedInput = input;
      return { ok: true, allowed: true, remaining: 59, retryAfterSeconds: 0 };
    });

    assert.deepEqual(checkedInput, {
      keyPrefix: "provider-image-relay",
      subject: "author:42",
      window: "minute",
      limit: 60,
    });
    assert.deepEqual(result, { allowed: true, retryAfterSeconds: undefined });
  });

  it("preserves the retry delay when the actor exceeds the limit", async () => {
    const result = await checkProviderImageRelayRateLimit("admin:7", async () => ({
      ok: true,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 37,
    }));

    assert.deepEqual(result, { allowed: false, retryAfterSeconds: 37 });
  });

  it("fails open when the rate-limit store is unavailable", async () => {
    const result = await checkProviderImageRelayRateLimit("author:42", async () => ({
      ok: false,
      error: "unavailable",
    }));

    assert.deepEqual(result, { allowed: true, retryAfterSeconds: undefined });
  });
});
