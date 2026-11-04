import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { CURRENT_CONSENT_VERSION, isCurrentConsentSubmission, PersonalDataConsentRequiredError } from "../src/lib/privacy/consent";

// Execute the actual entrypoints with request/DB boundaries replaced; no Next server needed.
function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandboxModule = { exports: {} as T };
  vm.runInNewContext(code, {
    module: sandboxModule, exports: sandboxModule.exports, Response, URL, console,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  }, { filename: path });
  return sandboxModule.exports;
}

function authHarness() {
  let signedIn = true;
  let accepted = false;
  let requirementEnabled = true;
  let revoked = 0;
  const deps = {
    "next/headers": { cookies: async () => ({ get: () => signedIn ? { value: "existing-session" } : undefined, set: () => {} }), headers: async () => new Headers() },
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/db/queries/personal-data-consent": { hasRequiredPersonalDataConsent: async () => !requirementEnabled || accepted },
    "@/db/operations/author-auth": {},
    "@/db/queries/author-auth": {
      getActiveAuthorSessionByTokenHash: async () => ({ authorId: 1, authorCode: "author", sessionId: 9 }),
      touchAuthorSession: async () => {}, revokeAuthorSessionByTokenHash: async () => { revoked++; },
    },
    "@/db/queries/authors": { getAuthorById: async () => ({ id: 1, code: "author", blockedAt: null }) },
    "@/lib/auth/author-session": { hashAuthorSessionToken: (token: string) => token, AUTHOR_SESSION_COOKIE_NAME: "author_session_v2" },
    "@/lib/auth/cookies": { shouldUseSecureCookies: () => false },
  };
  return { auth: load<typeof import("../src/lib/auth/author-auth")>("src/lib/auth/author-auth.ts", deps), setRequired: (value: boolean) => { requirementEnabled = value; }, setAccepted: (value: boolean) => { accepted = value; }, signOut: () => { signedIn = false; }, revoked: () => revoked };
}

test("consent requires the explicit checkbox and exact current version", () => {
  for (const value of [undefined, null, false, true, "", "on"]) assert.equal(isCurrentConsentSubmission(CURRENT_CONSENT_VERSION, value), false);
  assert.equal(isCurrentConsentSubmission("older", "yes"), false);
  assert.equal(isCurrentConsentSubmission(CURRENT_CONSENT_VERSION, "yes"), true);
});

test("existing session survives absent consent; private actions redirect and APIs deny", async () => {
  const h = authHarness();
  assert.equal((await h.auth.getCurrentAuthorSession())?.author.id, 1);
  assert.equal(await h.auth.getCurrentAuthor(), null);
  await assert.rejects(h.auth.requireAuthor(), /redirect:\/author\/consent/);
  const response = await h.auth.getPersonalDataConsentDenial();
  assert.equal(response?.status, 403);
  assert.equal((await response?.json()).code, "consent_required");
  assert.equal(h.revoked(), 0);
  h.setAccepted(true);
  assert.equal((await h.auth.requireAuthor()).id, 1);
  assert.equal(await h.auth.getPersonalDataConsentDenial(), null);
  h.setAccepted(false);
  await assert.rejects(h.auth.requireAuthorSession(), /redirect:\/author\/consent/);
  h.signOut();
  assert.equal(await h.auth.getPersonalDataConsentDenial(), null);
  await assert.rejects(h.auth.requireAuthor(), /redirect:\/author\/login/);
});

test("acceptance rejects stale forms and refusal revokes only the current session", async () => {
  const h = authHarness();
  let writes = 0;
  const actions = load<typeof import("../src/app/author/consent/actions")>("src/app/author/consent/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/lib/auth/author-auth": h.auth,
    "@/lib/privacy/consent": { isCurrentConsentSubmission, PersonalDataConsentRequiredError },
    "@/db/queries/personal-data-consent": { isPersonalDataConsentRequired: async () => true, hasRequiredPersonalDataConsent: async () => false, acceptPersonalDataConsent: async () => { writes++; return true; } },
  });
  const form = new FormData(); form.set("version", "older"); form.set("accepted", "yes");
  assert.equal(typeof await actions.acceptConsentAction(null, form), "string");
  assert.equal(writes, 0);
  form.set("version", CURRENT_CONSENT_VERSION);
  await assert.rejects(actions.acceptConsentAction(null, form), /redirect:\/author/);
  assert.equal(writes, 1);
  await assert.rejects(actions.refuseConsentAction(), /redirect:\/$/);
  assert.equal(h.revoked(), 1);
});

test("direct user HUD and notification API calls return 403 before personal queries", async () => {
  const h = authHarness();
  const unexpected = () => { throw new Error("personal query must not run"); };
  const hud = load<typeof import("../src/app/api/user-hud/route")>("src/app/api/user-hud/route.ts", {
    "@/lib/auth/author-auth": h.auth,
    "@/db/queries/ratings": { getAuthorRatingsCount: unexpected },
    "@/db/queries/quizzes": { getActiveQuizParticipantState: unexpected },
  });
  assert.equal((await hud.GET()).status, 403);
  const notifications = load<typeof import("../src/app/api/notifications/route")>("src/app/api/notifications/route.ts", {
    "next/server": { NextResponse: Response }, "@/lib/auth/author-auth": h.auth,
    "@/lib/notifications/inbox": new Proxy({}, { get: () => unexpected }),
  });
  assert.equal((await notifications.GET()).status, 403);
  assert.equal((await notifications.DELETE()).status, 403);
});

test("registration entrypoint validates consent before creating or correcting an account", async () => {
  let registered = 0;
  let corrected = 0;
  let conflict = false;
  let concurrentToggle = false;
  let required = true;
  const source = readFileSync("src/app/author/register/actions.ts", "utf8");
  const dependencies: Record<string, unknown> = Object.fromEntries([...source.matchAll(/from "([^"]+)"/g)].map((match) => [match[1], {}]));
  Object.assign(dependencies, {
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/lib/privacy/consent": { isCurrentConsentSubmission, PersonalDataConsentRequiredError },
    "@/db/queries/personal-data-consent": { isPersonalDataConsentRequired: async () => required },
    "@/lib/auth/features": { isAuthorEmailVerificationBypassed: () => true, isAuthorRegistrationEnabled: () => true },
    "@/lib/auth/mutation-rate-limit": { checkAuthorAuthMutationRateLimit: async () => ({ ok: true }) },
    "@/lib/auth/author-account": { isValidAuthorLogin: () => true, isValidAuthorEmail: () => true, normalizeAuthorEmail: (v: string) => v, normalizeAuthorLogin: (v: string) => v, validateAuthorPassword: () => ({ ok: true }) },
    "@/lib/auth/registration-turnstile": { isTurnstileRegistrationBypassed: () => true },
    "@/lib/auth/password": { hashPassword: async () => "hash", verifyPasswordOrDummy: async () => true },
    "@/lib/activity-logs/server": { logActivity: async () => {} },
    "@/lib/common/app-error-messages": { getUniqueViolationConstraint: () => "author_accounts_normalized_login_unique" },
    "@/db/queries/author-auth": { getAuthorAccountByNormalizedLogin: async () => ({ authorId: 7, status: "pending_email", passwordHash: "hash" }) },
    "@/db/operations/author-auth": {
      registerAuthorAccount: async (input: { consentVersion: string }) => { assert.equal(input.consentVersion, required ? CURRENT_CONSENT_VERSION : undefined); registered++; if (concurrentToggle) throw new PersonalDataConsentRequiredError(); if (conflict) throw new Error("conflict"); return { id: 7 }; },
      replacePendingAuthorRegistrationEmail: async (input: { consentVersion: string }) => { assert.equal(input.consentVersion, required ? CURRENT_CONSENT_VERSION : undefined); corrected++; return { authorId: 7 }; },
    },
  });
  const actions = load<typeof import("../src/app/author/register/actions")>("src/app/author/register/actions.ts", dependencies);
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "Автор", login: "author", email: "author@example.test", password: "password", passwordConfirmation: "password", formStartedAt: String(Date.now() - 5000), consentVersion: CURRENT_CONSENT_VERSION })) form.set(key, value);
  assert.equal((await actions.registerAuthorAction(null, form))?.error, "consent");
  form.set("consentAccepted", "yes"); form.set("consentVersion", "older");
  assert.equal((await actions.registerAuthorAction(null, form))?.error, "consent");
  assert.equal(registered, 0);
  form.set("consentVersion", CURRENT_CONSENT_VERSION);
  await assert.rejects(actions.registerAuthorAction(null, form), /redirect:/);
  assert.equal(registered, 1);
  conflict = true;
  await assert.rejects(actions.registerAuthorAction(null, form), /redirect:/);
  assert.equal(corrected, 1);
  required = false; conflict = false;
  form.delete("consentVersion"); form.delete("consentAccepted");
  await assert.rejects(actions.registerAuthorAction(null, form), /redirect:/);
  assert.equal(registered, 3);
  conflict = true;
  await assert.rejects(actions.registerAuthorAction(null, form), /redirect:/);
  assert.equal(corrected, 2);
  conflict = false;
  concurrentToggle = true;
  assert.equal((await actions.registerAuthorAction(null, form))?.error, "consent");
  concurrentToggle = false;
  required = true;
  assert.equal((await actions.registerAuthorAction(null, form))?.error, "consent");
});

test("Yandex OAuth callback gates new and repeat logins, and refuses linking before consent", async () => {
  let accepted = false;
  let current: { author: { id: number }; session: { sessionId: number } } | null = null;
  let intent = "login";
  let requirementEnabled = true;
  let cookiesWritten = 0;
  let completed = 0;
  let avatarUploads = 0;
  class ExternalAuthError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }
  const source = readFileSync("src/lib/auth/external/http.ts", "utf8");
  const dependencies: Record<string, unknown> = Object.fromEntries([...source.matchAll(/(?:from|import) "([^"]+)"/g)].map((match) => [match[1], {}]));
  Object.assign(dependencies, {
    "server-only": {},
    "next/headers": { cookies: async () => ({ get: () => ({ value: "browser" }) }), headers: async () => new Headers() },
    "next/server": { NextResponse: class extends Response { static redirect(url: URL, status: number) { return new Response(null, { status, headers: { Location: url.href } }); } } },
    "@/db/queries/personal-data-consent": { hasRequiredPersonalDataConsent: async () => !requirementEnabled || accepted },
    "@/db/operations/external-auth": { ExternalAuthError, completeExternalAuth: async () => { completed++; return { authorId: 1, identityId: 2, avatarSourceIdentityId: 2, token: "session" }; } },
    "@/lib/auth/author-auth": { getCurrentAuthorSession: async () => current, writeAuthorSessionCookie: async () => { cookiesWritten++; } },
    "@/lib/auth/rate-limits": { checkAuthRateLimit: async () => ({ ok: true }), getAuthRequestIpAddress: async () => null },
    "@/lib/services/redis": { getRedisClient: async () => ({}) },
    "@/lib/site-url": { getSiteOrigin: () => new URL("https://gikoteka.top") },
    "@/lib/activity-logs/server": { logActivity: async () => {} },
    "./attempts": { consumeExternalAttempt: async () => ({ intent, configurationRevision: 1, returnTo: "/author", authorId: 1, sessionId: 9 }) },
    "./registry": { getExternalAuthAdapter: async () => ({ configurationRevision: 1, callbackMethods: ["GET"], verify: async () => ({ avatarUrl: "https://avatars.example.test/a" }) }) },
    "./model": { isExternalProviderAvailable: () => true, validateExternalIdentity: (v: unknown) => v, safeExternalReturnTo: (v: string) => v },
    "./avatar": { uploadExternalAvatar: async () => { avatarUploads++; throw new Error("not needed"); } },
  });
  const http = load<typeof import("../src/lib/auth/external/http")>("src/lib/auth/external/http.ts", dependencies);
  const callback = () => http.finishExternalAuth(new Request("https://gikoteka.top/author/auth/yandex/callback?state=state"), "yandex");
  assert.equal((await callback()).headers.get("location"), "https://gikoteka.top/author/consent");
  assert.equal(cookiesWritten, 1);
  assert.equal(avatarUploads, 0, "no profile avatar mutation before consent");
  accepted = true;
  assert.equal((await callback()).headers.get("location"), "https://gikoteka.top/author");
  assert.equal(completed, 2);
  intent = "link"; accepted = false; current = { author: { id: 1 }, session: { sessionId: 9 } };
  assert.equal((await callback()).headers.get("location"), "https://gikoteka.top/author/consent");
  assert.equal(completed, 2, "linking must not reach the mutation");
  requirementEnabled = false;
  assert.equal((await callback()).headers.get("location"), "https://gikoteka.top/author/profile?externalLinked=1");
  intent = "login"; current = null;
  assert.equal((await callback()).headers.get("location"), "https://gikoteka.top/author");
});


test("disabling consent restores normal account access without clearing session or history", async () => {
  const h = authHarness();
  h.setRequired(false);
  assert.equal((await h.auth.requireAuthor()).id, 1);
  assert.equal((await h.auth.getCurrentAuthor())?.id, 1);
  assert.equal(await h.auth.getPersonalDataConsentDenial(), null);
  assert.equal(h.revoked(), 0);
  h.setRequired(true);
  await assert.rejects(h.auth.requireAuthor(), /redirect:\/author\/consent/);
  h.setAccepted(true);
  assert.equal((await h.auth.requireAuthor()).id, 1);
  h.setRequired(false); h.setRequired(true);
  assert.equal((await h.auth.requireAuthor()).id, 1);
});

test("stale consent forms do nothing after the requirement is disabled", async () => {
  const h = authHarness();
  const unexpected = () => { throw new Error("must not mutate"); };
  const actions = load<typeof import("../src/app/author/consent/actions")>("src/app/author/consent/actions.ts", {
    "next/cache": { revalidatePath: unexpected },
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/lib/auth/author-auth": h.auth,
    "@/lib/privacy/consent": { isCurrentConsentSubmission, PersonalDataConsentRequiredError },
    "@/db/queries/personal-data-consent": { isPersonalDataConsentRequired: async () => false, acceptPersonalDataConsent: unexpected, hasRequiredPersonalDataConsent: async () => true },
  });
  await assert.rejects(actions.acceptConsentAction(null, new FormData()), /redirect:\/author$/);
  await assert.rejects(actions.refuseConsentAction(), /redirect:\/author$/);
  assert.equal(await actions.needsPersonalDataConsent(), false);
  assert.equal(h.revoked(), 0);
});

test("registration checkbox and submit restriction follow the server-provided flag", () => {
  const path = "src/app/author/register/author-registration-form.tsx";
  const source = readFileSync(path, "utf8");
  const dependencies: Record<string, unknown> = Object.fromEntries([...source.matchAll(/from "([^"]+)"/g)].map((match) => [match[1], {}]));
  Object.assign(dependencies, {
    react: { useEffect: () => {}, useState: (initial: unknown) => [initial, () => {}], useActionState: () => [null, () => {}, false], useCallback: (callback: unknown) => callback },
    "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }), Fragment: "fragment" },
  });
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const sandboxModule = { exports: {} as typeof import("../src/app/author/register/author-registration-form") };
  vm.runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  type Element = { props: { children?: unknown; name?: string; type?: string; disabled?: boolean } };
  const find = (node: unknown, predicate: (element: Element) => boolean): Element | undefined => {
    if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== "object" || !("props" in node)) return undefined;
    const element = node as Element;
    return predicate(element) ? element : find(element.props.children, predicate);
  };
  for (const required of [false, true]) {
    const tree = sandboxModule.exports.AuthorRegistrationForm({ consentRequired: required, turnstileRequired: false, turnstileSiteKey: null });
    assert.equal(Boolean(find(tree, (element) => element.props.name === "consentAccepted")), required);
    assert.equal(Boolean(find(tree, (element) => element.props.name === "consentVersion")), required);
    assert.equal(find(tree, (element) => element.props.type === "submit")?.props.disabled, required);
  }
});
