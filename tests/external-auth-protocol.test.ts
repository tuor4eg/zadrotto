import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync, sign, timingSafeEqual } from "node:crypto";
import { test } from "node:test";
import * as oauth from "oauth4webapi";
import { safeExternalReturnTo, validateExternalIdentity, type ExternalAuthAttempt, type ExternalAuthAdapter } from "../src/lib/auth/external/model";
import { createOAuthAdapter } from "../src/lib/auth/external/oauth";

const attempt: ExternalAuthAttempt = { provider: "example", intent: "login", browserHash: "hash", returnTo: "/author/profile", state: "s".repeat(43), verifier: "v".repeat(43), nonce: "nonce" };
const callbackUrl = "https://app.example/auth/external/example/callback";
const server = { issuer: "https://identity.example", authorization_endpoint: "https://identity.example/authorize", token_endpoint: "https://identity.example/token", jwks_uri: "https://identity.example/jwks", userinfo_endpoint: "https://identity.example/userinfo" };
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
const adapter = () => createOAuthAdapter({ code: "example", name: "Example", protocol: "oidc", enabled: true, configured: true, server, client: { client_id: "test-client" }, clientAuthentication: oauth.None(), scopes: ["openid", "profile"] });
function token(overrides: Record<string, unknown> = {}, invalidSignature = false) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: jwk.kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: server.issuer, aud: "test-client", sub: "CaseSensitiveSubject", iat: now, exp: now + 300, nonce: attempt.nonce, ...overrides })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), invalidSignature ? otherKeys.privateKey : keys.privateKey).toString("base64url")}`;
}

test("return path validation rejects external, protocol-relative and control-character paths", () => {
  for (const path of [undefined, "https://evil.example", "//evil.example", "/\\evil.example", "/\nevil", "/foo bar", "javascript:alert(1)"]) assert.equal(safeExternalReturnTo(path), "/author/profile");
  assert.equal(safeExternalReturnTo("/archive?q=game#entry"), "/archive?q=game#entry");
});

test("identity normalization preserves exact subject and drops provider recovery email", () => {
  assert.deepEqual(validateExternalIdentity({ subject: "AbC", name: "  Name  ", email: { value: "trusted@example.com", verified: true } }), { subject: "AbC", name: "Name", displayValue: null, avatarUrl: null });
  for (const subject of ["", "bad\nsubject", "x".repeat(1025)]) assert.throws(() => validateExternalIdentity({ subject }));
});

test("OIDC authorization binds state, nonce, callback and S256 PKCE", async () => {
  const url = await adapter().start({ attempt, callbackUrl });
  assert.equal(url.searchParams.get("state"), attempt.state);
  assert.equal(url.searchParams.get("nonce"), attempt.nonce);
  assert.equal(url.searchParams.get("redirect_uri"), callbackUrl);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(attempt.verifier).digest("base64url"));
});

test("OIDC validates signed tokens and userinfo using actual protocol processing", async (t) => {
  let idToken = token();
  let userSubject = "CaseSensitiveSubject";
  let tokenCalls = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    assert.equal(init?.redirect, "error");
    if (url === server.token_endpoint) {
      tokenCalls++;
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("code_verifier"), attempt.verifier);
      assert.equal(body.get("redirect_uri"), callbackUrl);
      return Response.json({ access_token: "access", token_type: "Bearer", id_token: idToken });
    }
    if (url === server.jwks_uri) return Response.json({ keys: [jwk] });
    if (url === server.userinfo_endpoint) return Response.json({ sub: userSubject, name: "Example" });
    throw new Error(`Unexpected request ${url}`);
  });
  const verify = (state = attempt.state) => adapter().verify({ attempt, callbackUrl, parameters: new URLSearchParams({ code: "code", state }) });
  assert.deepEqual(await verify(), { subject: "CaseSensitiveSubject", name: "Example", avatarUrl: null, displayValue: null });
  for (const overrides of [{ nonce: "wrong" }, { aud: "other-client" }, { iss: "https://evil.example" }, { exp: Math.floor(Date.now() / 1000) - 600 }]) {
    idToken = token(overrides);
    await assert.rejects(verify());
  }
  idToken = token({}, true);
  await assert.rejects(verify());
  idToken = token();
  userSubject = "casesensitivesubject";
  await assert.rejects(verify());
  const before = tokenCalls;
  await assert.rejects(verify("wrong-state"));
  assert.equal(tokenCalls, before, "invalid callback state must fail before token exchange");
});

test("provider metadata rejects insecure endpoints", () => {
  assert.throws(() => createOAuthAdapter({ code: "bad", name: "Bad", protocol: "oidc", enabled: true, configured: true, server: { ...server, token_endpoint: "http://identity.example/token" }, client: { client_id: "test" }, clientAuthentication: oauth.None(), scopes: ["openid"] }));
});

test("server registry rejects unknown providers without querying configuration", { skip: !process.execArgv.includes("--conditions=react-server") && !process.env.NODE_OPTIONS?.includes("--conditions=react-server") }, async () => {
  const registry = await import("../src/lib/auth/external/registry");
  assert.equal(await registry.getExternalAuthAdapter("unregistered"), null);
});

test("avatar URL and address validation rejects SSRF destinations", { skip: !process.execArgv.includes("--conditions=react-server") && !process.env.NODE_OPTIONS?.includes("--conditions=react-server") }, async () => {
  const { isPublicAvatarAddress, validateExternalAvatarUrl } = await import("../src/lib/auth/external/avatar");
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "::ffff:127.0.0.1", "224.0.0.1"]) assert.equal(isPublicAvatarAddress(ip), false, ip);
  assert.equal(isPublicAvatarAddress("8.8.8.8"), true);
  const origins = ["https://images.example"];
  for (const url of ["http://images.example/a", "https://images.example.evil/a", "https://images.example@evil.example/a", "https://user@images.example/a", "https://images.example:444/a", "https://images.example/a#fragment", "https://127.0.0.1/a"]) assert.throws(() => validateExternalAvatarUrl(url, origins), url);
  assert.equal(validateExternalAvatarUrl("https://images.example/a.webp", origins).hostname, "images.example");
});


test("OAuth2 resolves identity only after validated code exchange", async (t) => {
  let resolvedToken = "";
  t.mock.method(globalThis, "fetch", async () => Response.json({ access_token: "verified-access", token_type: "Bearer" }));
  const oauthAdapter = createOAuthAdapter({ code: "oauth", name: "OAuth", protocol: "oauth2", enabled: true, configured: true, server, client: { client_id: "test-client" }, clientAuthentication: oauth.None(), scopes: ["profile"], resolveOAuthIdentity: async (accessToken) => { resolvedToken = accessToken; return { subject: "OAuthSubject" }; } });
  const start = await oauthAdapter.start({ attempt, callbackUrl });
  assert.equal(start.searchParams.has("nonce"), false);
  await assert.rejects(oauthAdapter.verify({ attempt, callbackUrl, parameters: new URLSearchParams({ state: "wrong", code: "code" }) }));
  assert.equal(resolvedToken, "");
  assert.deepEqual(await oauthAdapter.verify({ attempt, callbackUrl, parameters: new URLSearchParams({ state: attempt.state, code: "code" }) }), { subject: "OAuthSubject" });
  assert.equal(resolvedToken, "verified-access");
});

test("signed protocol uses the same adapter contract and authenticates payload before identity", async () => {
  const secret = "test-only-adapter-secret";
  const signature = (payload: string) => createHmac("sha256", secret).update(payload).digest();
  const signedAdapter: ExternalAuthAdapter = {
    code: "signed-example", name: "Signed example", protocol: "signed", enabled: true, configured: true, callbackMethods: ["POST"], avatarOrigins: [],
    async start({ attempt: current, callbackUrl: callback }) {
      const url = new URL("https://signed.example/authorize");
      url.searchParams.set("state", current.state);
      url.searchParams.set("callback", callback);
      return url;
    },
    async verify({ attempt: current, parameters }) {
      const payload = parameters.get("payload") ?? "";
      const mac = Buffer.from(parameters.get("signature") ?? "", "hex");
      const expected = signature(payload);
      if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) throw new Error("Invalid signature");
      const result = JSON.parse(payload) as { state: string; subject: string };
      if (result.state !== current.state) throw new Error("Invalid state");
      return validateExternalIdentity({ subject: result.subject });
    },
  };
  assert.equal((await signedAdapter.start({ attempt, callbackUrl })).searchParams.get("state"), attempt.state);
  const payload = JSON.stringify({ state: attempt.state, subject: "SignedSubject" });
  const parameters = new URLSearchParams({ payload, signature: signature(payload).toString("hex") });
  assert.equal((await signedAdapter.verify({ attempt, callbackUrl, parameters })).subject, "SignedSubject");
  parameters.set("payload", JSON.stringify({ state: attempt.state, subject: "Attacker" }));
  await assert.rejects(signedAdapter.verify({ attempt, callbackUrl, parameters }), /Invalid signature/);
  const wrongState = JSON.stringify({ state: "wrong", subject: "SignedSubject" });
  await assert.rejects(signedAdapter.verify({ attempt, callbackUrl, parameters: new URLSearchParams({ payload: wrongState, signature: signature(wrongState).toString("hex") }) }), /Invalid state/);
});
