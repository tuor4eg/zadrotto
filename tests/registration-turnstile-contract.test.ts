import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actions = readFileSync("src/app/author/register/actions.ts", "utf8");
const form = readFileSync("src/app/author/register/author-registration-form.tsx", "utf8");
const page = readFileSync("src/app/author/register/page.tsx", "utf8");
const registrationTurnstile = readFileSync("src/lib/auth/registration-turnstile.ts", "utf8");
const servicesPage = readFileSync("src/app/admin/(protected)/tools/services/page.tsx", "utf8");
const turnstile = readFileSync("src/lib/auth/turnstile.ts", "utf8");
const widget = readFileSync("src/components/auth/turnstile-widget.tsx", "utf8");

describe("registration Turnstile contracts", () => {
  it("keeps the emergency bypass server-side and registration-specific", () => {
    assert.match(
      registrationTurnstile,
      /process\.env\.TURNSTILE_REGISTRATION_BYPASS === "true"/,
    );
    assert.match(actions, /const turnstileBypassed = isTurnstileRegistrationBypassed\(\)/);
    assert.match(actions, /if \(!turnstileBypassed\) \{[\s\S]*!isTurnstileConfigured\(\)[\s\S]*verifyTurnstileToken/);
    assert.match(actions, /turnstileBypassed \? "warning" : undefined/);
    assert.match(actions, /turnstileBypassed,/);
    assert.match(turnstile, /import "server-only"/);
    assert.match(turnstile, /process\.env\[name\]\?\.trim\(\) \|\| null/);
  });

  it("preserves existing registration checks before Turnstile and persistence", () => {
    const rateLimitIndex = actions.indexOf("checkAuthorAuthMutationRateLimit");
    const honeypotIndex = actions.indexOf("if (honeypot");
    const turnstileIndex = actions.indexOf("verifyTurnstileToken(turnstileToken");
    const registerIndex = actions.indexOf("registerAuthorAccount({");

    assert.ok(rateLimitIndex >= 0);
    assert.ok(honeypotIndex > rateLimitIndex);
    assert.ok(turnstileIndex > honeypotIndex);
    assert.ok(registerIndex > turnstileIndex);
  });

  it("renders and resets a managed widget only when required", () => {
    assert.match(page, /turnstileRequired=\{!turnstileBypassed\}/);
    assert.match(page, /turnstileSiteKey=\{turnstileBypassed \? null : getTurnstileSiteKey\(\)\}/);
    assert.match(form, /<TurnstileWidget[\s\S]*fieldName="turnstileToken"/);
    assert.match(form, /disabled=\{isPending \|\| !isTurnstileVerified\}/);
    assert.match(form, /resetKey=\{state\}/);
    assert.match(widget, /api\.js\?render=explicit/);
    assert.match(widget, /window\.turnstile\.reset\(widgetIdRef\.current\)/);
  });

  it("shows bypass as degraded service health", () => {
    assert.match(registrationTurnstile, /status: "degraded"/);
    assert.match(registrationTurnstile, /Аварийный обход регистрации включён/);
    assert.match(servicesPage, /checkRegistrationTurnstileHealth\(\)/);
    assert.match(servicesPage, /degraded: "Ослаблен"/);
  });
});
