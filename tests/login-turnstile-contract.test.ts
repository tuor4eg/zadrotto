import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actions = readFileSync("src/app/author/login/actions.ts", "utf8");
const form = readFileSync("src/app/author/login/author-login-form.tsx", "utf8");
const challenge = readFileSync("src/lib/auth/login-turnstile-challenge.ts", "utf8");

function functionSource(source: string, start: string, end?: string) {
  const startIndex = source.indexOf(`export async function ${start}`);
  const endIndex = end ? source.indexOf(`export async function ${end}`, startIndex + 1) : source.length;

  return source.slice(startIndex, endIndex);
}

describe("adaptive Turnstile on author password login", () => {
  it("keeps the hard limit before challenge and password verification", () => {
    const hardLimit = actions.indexOf("checkAuthorLoginRateLimit(");
    const challengeRead = actions.indexOf("getAuthorLoginChallengeState(challengeSubject)");
    const passwordVerification = actions.indexOf("verifyPasswordOrDummy(password");

    assert.ok(hardLimit >= 0);
    assert.ok(challengeRead > hardLimit);
    assert.ok(passwordVerification > challengeRead);
  });

  it("requires server-side Turnstile only for an active password challenge", () => {
    assert.match(actions, /if \(challengeState\.challengeRequired\) \{[\s\S]*verifyTurnstileToken\(turnstileToken/);
    assert.match(actions, /expectedAction: "author_login"/);
    assert.match(actions, /if \(!turnstile\.ok\)[\s\S]*error: "turnstile"[\s\S]*challengeRequired: true/);
  });

  it("records only failed password checks and clears state before session creation", () => {
    const passwordFailure = actions.indexOf("if (!account || !passwordMatches)");
    const recordFailure = actions.indexOf("recordAuthorLoginFailure(challengeSubject)");
    const clearChallenge = actions.indexOf("clearAuthorLoginChallenge(challengeSubject)");
    const createSession = actions.indexOf("setAuthorSessionCookie(account.authorId, \"password\")");

    assert.ok(recordFailure > passwordFailure);
    assert.ok(clearChallenge > recordFailure);
    assert.ok(createSession > clearChallenge);
    assert.match(actions, /verifyPasswordOrDummy\(password, account\?\.passwordHash\)/);
    assert.match(actions, /return \{[\s\S]*error: "invalid"[\s\S]*challengeRequired:/);
  });

  it("shows and resets the existing widget from server action state", () => {
    assert.match(form, /state\.challengeRequired && state\.turnstileSiteKey/);
    assert.match(form, /<TurnstileWidget[\s\S]*action="author_login"[\s\S]*fieldName="turnstileToken"/);
    assert.match(form, /resetKey=\{state\}/);
    assert.match(form, /challengeRequired && !turnstileVerified/);
  });

  it("keeps the challenge store server-only and independent from registration bypass", () => {
    const accessTokenLogin = functionSource(actions, "loginAuthorInline");

    assert.match(challenge, /import "server-only"/);
    assert.doesNotMatch(actions, /TURNSTILE_REGISTRATION_BYPASS|isTurnstileRegistrationBypassed/);
    assert.doesNotMatch(accessTokenLogin, /verifyTurnstileToken|getAuthorLoginChallengeState/);
  });
});
