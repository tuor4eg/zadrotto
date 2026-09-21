import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  verifyTurnstileTokenWithFetcher,
} from "@/lib/auth/turnstile-verification";

describe("Turnstile verification", () => {
  it("posts the token and validates success and action", async () => {
    let request: { url: string; init?: RequestInit } | undefined;

    const result = await verifyTurnstileTokenWithFetcher(" token ", {
      expectedAction: "author_register",
      secretKey: "secret-key",
      fetcher: async (input, init) => {
        request = { url: String(input), init };
        return Response.json({ success: true, action: "author_register" });
      },
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(request?.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(request?.init?.method, "POST");
    assert.equal(request?.init?.headers && new Headers(request.init.headers).get("content-type"), "application/x-www-form-urlencoded");
    assert.equal(request?.init?.body instanceof URLSearchParams, true);
    assert.deepEqual(
      Object.fromEntries(request?.init?.body as URLSearchParams),
      { secret: "secret-key", response: "token" },
    );
  });

  it("rejects missing and oversized tokens without making a request", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      return Response.json({ success: true, action: "author_register" });
    };

    assert.deepEqual(
      await verifyTurnstileTokenWithFetcher("   ", { expectedAction: "author_register", fetcher, secretKey: "secret-key" }),
      { ok: false, reason: "invalid" },
    );
    assert.deepEqual(
      await verifyTurnstileTokenWithFetcher("x".repeat(2_049), { expectedAction: "author_register", fetcher, secretKey: "secret-key" }),
      { ok: false, reason: "invalid" },
    );
    assert.equal(calls, 0);
  });

  it("rejects unsuccessful verification and a mismatched action", async () => {
    for (const payload of [
      { success: false, action: "author_register" },
      { success: true, action: "author_login" },
      { success: true },
    ]) {
      assert.deepEqual(
        await verifyTurnstileTokenWithFetcher("token", {
          expectedAction: "author_register",
          fetcher: async () => Response.json(payload),
          secretKey: "secret-key",
        }),
        { ok: false, reason: "invalid" },
      );
    }
  });

  it("fails closed when the secret is absent", async () => {
    let called = false;

    const result = await verifyTurnstileTokenWithFetcher("token", {
      expectedAction: "author_register",
      secretKey: null,
      fetcher: async () => {
        called = true;
        return Response.json({ success: true, action: "author_register" });
      },
    });

    assert.deepEqual(result, { ok: false, reason: "unavailable" });
    assert.equal(called, false);
  });

  it("fails closed on HTTP errors, invalid JSON, and network errors", async () => {
    const fetchers: Array<typeof fetch> = [
      async () => new Response(null, { status: 503 }),
      async () => new Response("not-json", { status: 200 }),
      async () => { throw new TypeError("network unavailable"); },
    ];

    for (const fetcher of fetchers) {
      assert.deepEqual(
        await verifyTurnstileTokenWithFetcher("token", { expectedAction: "author_register", fetcher, secretKey: "secret-key" }),
        { ok: false, reason: "unavailable" },
      );
    }
  });

  it("aborts a timed-out verification and fails closed", async () => {
    let signalWasAborted = false;

    const result = await verifyTurnstileTokenWithFetcher("token", {
      expectedAction: "author_register",
      secretKey: "secret-key",
      timeoutMs: 1,
      fetcher: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          signalWasAborted = true;
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    });

    assert.deepEqual(result, { ok: false, reason: "unavailable" });
    assert.equal(signalWasAborted, true);
  });
});
