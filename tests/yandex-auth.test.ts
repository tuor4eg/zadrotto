import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createYandexAdapter, parseYandexIdentity } from "../src/lib/auth/external/yandex";
import type { ExternalAuthAttempt } from "../src/lib/auth/external/model";

const clientId = "test-client";
const attempt: ExternalAuthAttempt = { provider: "yandex", intent: "login", browserHash: "hash", returnTo: "/author/profile", state: "s".repeat(43), verifier: "v".repeat(43), nonce: "nonce" };
const callbackUrl = "https://app.example/auth/external/yandex/callback";
const profile = { id: "CaseSensitive123", client_id: clientId, real_name: "  Test Name  ", display_name: "Display", login: "login", default_avatar_id: "123/abc-def", is_avatar_empty: false, default_email: "ignored@example.com" };
const adapter = () => createYandexAdapter({ enabled: true, credentials: { clientId, clientSecret: "secret" }, revision: "revision" });
const verify = (parameters = new URLSearchParams({ state: attempt.state, code: "code" })) => adapter().verify({ attempt, callbackUrl, parameters });

test("Yandex identity uses exact ID, name precedence and trusted avatar origin without recovery email", () => {
  assert.deepEqual(parseYandexIdentity(profile, clientId), { subject: profile.id, name: "Test Name", displayValue: "login", avatarUrl: "https://avatars.yandex.net/get-yapic/123/abc-def/islands-200" });
  assert.equal(parseYandexIdentity({ ...profile, real_name: " ", display_name: " Display " }, clientId).name, "Display");
  assert.equal(parseYandexIdentity({ ...profile, real_name: null, display_name: "x".repeat(81) }, clientId).name, "login");
  assert.equal(parseYandexIdentity({ id: "123", client_id: clientId }, clientId).name, null);
  for (const change of [{ is_avatar_empty: true }, { is_avatar_empty: undefined }, ...["", "../evil", "https://evil.example/a", "a?b", "a#b", "a//b", "x".repeat(257), 123].map(default_avatar_id => ({ default_avatar_id }))]) {
    assert.equal(parseYandexIdentity({ ...profile, ...change }, clientId).avatarUrl, null);
  }
  for (const invalid of [null, [], "text", { ...profile, client_id: "other" }, ...[undefined, 123, "", " ", "a b", "a\n", "a\u007f", "x".repeat(1025)].map(id => ({ ...profile, id }))]) assert.throws(() => parseYandexIdentity(invalid, clientId));
});

test("Yandex authorization and exchange bind PKCE, callback, Basic credentials and OAuth profile header", async (t) => {
  const start = await adapter().start({ attempt, callbackUrl });
  assert.equal(start.origin, "https://oauth.yandex.ru");
  assert.equal(start.searchParams.get("scope"), "login:info login:avatar");
  assert.equal(start.searchParams.get("client_id"), clientId);
  assert.equal(start.searchParams.get("state"), attempt.state);
  assert.equal(start.searchParams.get("redirect_uri"), callbackUrl);
  assert.equal(start.searchParams.get("code_challenge_method"), "S256");
  assert.equal(start.searchParams.get("code_challenge"), createHash("sha256").update(attempt.verifier).digest("base64url"));
  assert.equal(start.searchParams.has("nonce"), false);
  const timeoutDurations: number[] = [];
  const originalTimeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => { timeoutDurations.push(milliseconds); return originalTimeout(milliseconds); });
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(String(input));
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal instanceof AbortSignal);
    const headers = new Headers(init?.headers);
    if (String(input) === "https://oauth.yandex.ru/token") {
      assert.equal(headers.get("authorization"), `Basic ${Buffer.from("test%2Dclient:secret").toString("base64")}`);
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("code_verifier"), attempt.verifier);
      assert.equal(body.get("redirect_uri"), callbackUrl);
      assert.equal(body.get("code"), "code");
      return Response.json({ access_token: "access", token_type: "Bearer" });
    }
    assert.equal(String(input), "https://login.yandex.ru/info?format=json");
    assert.equal(headers.get("authorization"), "OAuth access");
    assert.equal(headers.get("accept"), "application/json");
    return Response.json(profile);
  });
  assert.deepEqual(await verify(), parseYandexIdentity(profile, clientId));
  assert.equal(requests.length, 2);
  assert.deepEqual(timeoutDurations, [10_000, 10_000]);
});

test("Yandex rejects wrong state and cancellation before any fetch", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("unexpected fetch"); });
  await assert.rejects(verify(new URLSearchParams({ state: "wrong", code: "code" })));
  await assert.rejects(verify(new URLSearchParams({ state: attempt.state, error: "access_denied" })));
  assert.equal(calls, 0);
});

test("Yandex rejects failed, malformed and oversized token/profile responses", async (t) => {
  for (const stage of ["token", "profile"]) {
    for (const failure of ["http", "redirect", "json", "oversized", "invalid", "timeout"]) {
      await t.test(`${stage}: ${failure}`, async (subtest) => {
        let profileCalls = 0;
        subtest.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
          const isToken = String(input) === "https://oauth.yandex.ru/token";
          if (!isToken) profileCalls++;
          if ((stage === "token") !== isToken) return Response.json({ access_token: "access", token_type: "Bearer" });
          if (failure === "timeout") throw new DOMException("Timed out", "TimeoutError");
          if (failure === "http") return new Response("unavailable", { status: 503 });
          if (failure === "redirect") return new Response(null, { status: 302, headers: { location: "https://evil.example" } });
          if (failure === "json") return new Response("{", { headers: { "content-type": "application/json" } });
          if (failure === "oversized") return Response.json({ padding: "x".repeat(65_537) });
          return Response.json(isToken ? { token_type: "Bearer" } : { ...profile, client_id: "other" });
        });
        await assert.rejects(verify());
        assert.equal(profileCalls, stage === "token" ? 0 : 1);
      });
    }
  }
});
