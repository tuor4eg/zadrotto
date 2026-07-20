import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const queries = readFileSync("src/db/queries/author-auth.ts", "utf8");
const operations = readFileSync("src/db/operations/author-auth.ts", "utf8");
const loginActions = readFileSync("src/app/author/login/actions.ts", "utf8");
const loginForm = readFileSync("src/app/author/login/author-login-form.tsx", "utf8");
const registrationActions = readFileSync("src/app/author/register/actions.ts", "utf8");
const registrationPage = readFileSync("src/app/author/register/page.tsx", "utf8");
const onboardingPage = readFileSync("src/app/author/onboarding/page.tsx", "utf8");
const resetPasswordPage = readFileSync("src/app/author/reset-password/page.tsx", "utf8");
const securityPage = readFileSync("src/app/author/(protected)/settings/security/page.tsx", "utf8");
const passwordField = readFileSync("src/components/auth/password-field.tsx", "utf8");
const registrationTimestamp = readFileSync(
  "src/app/author/register/registration-started-at-input.tsx",
  "utf8",
);
const onboardingActions = readFileSync("src/app/author/onboarding/actions.ts", "utf8");
const forgotActions = readFileSync("src/app/author/forgot-password/actions.ts", "utf8");
const verifyPage = readFileSync("src/app/author/verify-email/page.tsx", "utf8");
const verifyActions = readFileSync("src/app/author/verify-email/actions.ts", "utf8");
const settingsActions = readFileSync(
  "src/app/author/(protected)/settings/security/actions.ts",
  "utf8",
);
const reviewActions = readFileSync(
  "src/app/admin/(protected)/registration-review/actions.ts",
  "utf8",
);
const outboxQueries = readFileSync("src/db/queries/email-outbox.ts", "utf8");
const migration = readFileSync("drizzle/0032_yielding_blockbuster.sql", "utf8");

function functionSource(source: string, name: string, nextName?: string) {
  const start = source.indexOf(`export async function ${name}`);
  const end = nextName ? source.indexOf(`export async function ${nextName}`, start) : source.length;
  assert.notEqual(start, -1, `${name} must exist`);
  return source.slice(start, end === -1 ? source.length : end);
}

describe("author auth persistence contracts", () => {
  it("gates sessions by expiry, revocation and account state", () => {
    const source = functionSource(queries, "getActiveAuthorSessionByTokenHash", "touchAuthorSession");

    assert.match(source, /isNull\(authorSessions\.revokedAt\)/);
    assert.match(source, /gt\(authorSessions\.expiresAt, now\)/);
    assert.match(source, /isNull\(authorAccounts\.authorId\)/);
    assert.match(source, /eq\(authorAccounts\.status, "active"\)/);
    assert.match(source, /eq\(authorSessions\.authMethod, "access_token"\)[\s\S]*eq\(authorAccounts\.status, "pending_email"\)/);
    assert.doesNotMatch(source, /pending_approval|rejected/);
  });

  it("consumes challenges once and strictly before expiry", () => {
    const generic = functionSource(queries, "consumeAuthorAuthChallenge", "insertAuthorSession");
    assert.match(generic, /isNull\(authorAuthChallenges\.consumedAt\)/);
    assert.match(generic, /gt\(authorAuthChallenges\.expiresAt, now\)/);

    for (const name of ["verifyAuthorEmailChallenge", "resetAuthorPassword"]) {
      const source = functionSource(operations, name);
      assert.match(source, /\.set\(\{ consumedAt: now \}\)/);
      assert.match(source, /isNull\(authorAuthChallenges\.consumedAt\)/);
      assert.match(source, /expiresAt\} > \$\{now\}/);
    }
  });

  it("keeps registration transitions distinct for legacy and new authors", () => {
    const verify = functionSource(operations, "verifyAuthorEmailChallenge", "requestAuthorEmailChange");
    assert.match(verify, /const nextStatus = legacyToken \? "active" : "pending_approval"/);
    assert.match(operations, /status: "pending_email"/);
    assert.match(onboardingActions, /isFreshAccessTokenSession\(current\.session\)/);
    assert.match(onboardingActions, /getAuthorAccountByAuthorId\(current\.author\.id\)/);
    assert.match(registrationActions, /redirect\("\/author\/register\?sent=1"\)/);
    assert.match(registrationPage, /if \(!isAuthorRegistrationEnabled\(\)\) notFound\(\)/);
    assert.match(registrationPage, /Регистрация временно недоступна: отправка писем ещё не настроена/);
    assert.doesNotMatch(
      registrationPage,
      /!isAuthorRegistrationEnabled\(\) \|\| !\(await isAuthorEmailDeliveryConfigured\(\)\)\) notFound/,
    );
  });

  it("uses the informative password strength field only for new passwords", () => {
    for (const page of [registrationPage, onboardingPage, resetPasswordPage, securityPage]) {
      assert.match(page, /<PasswordField[\s\S]*name="password"/);
      assert.match(page, /autoComplete="new-password"/);
      assert.match(page, /minLength=\{AUTHOR_PASSWORD_MIN_LENGTH\}/);
      assert.match(page, /maxLength=\{AUTHOR_PASSWORD_MAX_LENGTH\}/);
    }
    assert.match(registrationPage, /name="passwordConfirmation"[\s\S]*minLength=\{AUTHOR_PASSWORD_MIN_LENGTH\}[\s\S]*maxLength=\{AUTHOR_PASSWORD_MAX_LENGTH\}/);
    assert.match(onboardingPage, /name="passwordConfirmation"[\s\S]*minLength=\{AUTHOR_PASSWORD_MIN_LENGTH\}[\s\S]*maxLength=\{AUTHOR_PASSWORD_MAX_LENGTH\}/);
    assert.match(passwordField, /Минимум \$\{AUTHOR_PASSWORD_MIN_LENGTH\} символов/);
    assert.match(passwordField, /Сложность пароля:/);
    assert.match(passwordField, /aria-describedby=\{describedBy\}/);
    assert.match(passwordField, /aria-live="polite"/);
    assert.match(passwordField, /aria-hidden="true"/);
    assert.match(passwordField, /weak: "bg-red-500"/);
    assert.match(passwordField, /strong: "bg-emerald-600"/);
    assert.match(passwordField, /Omit<[\s\S]*"defaultValue" \| "type" \| "value"/);

    assert.doesNotMatch(loginForm, /PasswordField|AUTHOR_PASSWORD_MIN_LENGTH|AUTHOR_PASSWORD_MAX_LENGTH/);
    assert.match(loginForm, /name="password"[\s\S]*autoComplete="current-password"/);
    assert.doesNotMatch(loginForm, /name="password"[\s\S]*minLength=/);

    assert.equal((securityPage.match(/<PasswordField/g) ?? []).length, 1);
    assert.match(securityPage, /<Label htmlFor="newPassword">Новый пароль<\/Label><PasswordField id="newPassword" name="password"/);
    assert.match(securityPage, /name="currentPassword" type="password" autoComplete="current-password"/);
    assert.doesNotMatch(securityPage, /name="currentPassword"[^>]*(?:minLength|maxLength)=/);
  });

  it("requires verified pending registrations for admin review", () => {
    const review = functionSource(operations, "reviewAuthorRegistration", "cleanupAuthorAuthData");
    assert.match(review, /eq\(authorAccounts\.status, "pending_approval"\)/);
    assert.match(review, /isNotNull\(authorEmails\.verifiedAt\)/);
    assert.match(review, /status: "active"/);
    assert.match(review, /status: "rejected"/);
    assert.match(review, /eq\(authorAccessProfiles\.isSystem, false\)/);
    assert.match(reviewActions, /formData\.get\("decision"\) === "reject" \? "reject" : "approve"/);
  });

  it("keeps login failures generic and always performs password verification", () => {
    const passwordLogin = functionSource(loginActions, "loginAuthorWithPasswordInline", "loginAuthorInline");
    assert.match(passwordLogin, /verifyPasswordOrDummy\(password, account\?\.passwordHash\)/);
    assert.match(passwordLogin, /if \(!account \|\| !passwordMatches\)/);
    assert.match(passwordLogin, /return \{ ok: false, error: "invalid" \}/);
    assert.doesNotMatch(passwordLogin, /not-found|wrong-password|pending_approval|rejected/);
  });

  it("applies the documented session revocation policy", () => {
    const reset = functionSource(operations, "resetAuthorPassword", "reviewAuthorRegistration");
    assert.match(reset, /update\(authorSessions\)[\s\S]*eq\(authorSessions\.authorId, challenge\.authorId\)/);
    assert.match(settingsActions, /revokeAllAuthorSessions\(current\.author\.id, current\.session\.sessionId\)/);
    assert.match(settingsActions, /intent === "all"[\s\S]*revokeAllAuthorSessions\(current\.author\.id\)/);
    assert.match(settingsActions, /revokeAuthorSessionById\(current\.author\.id, sessionId\)/);
  });

  it("switches email only after consuming its challenge and revokes sessions", () => {
    const verify = functionSource(operations, "verifyAuthorEmailChallenge", "requestAuthorEmailChange");
    assert.match(verify, /challenge\.purpose === "change_email"/);
    assert.match(verify, /set\(\{ isPrimary: false/);
    assert.match(verify, /set\(\{ isPrimary: true, verifiedAt: now/);
    assert.match(verify, /update\(authorSessions\)\.set\(\{ revokedAt: now \}\)/);
    assert.match(settingsActions, /updated=email-pending/);
  });

  it("claims outbox rows atomically with bounded leases", () => {
    const claim = functionSource(outboxQueries, "claimPendingEmailOutboxMessages", "updateEmailOutboxStatus");
    assert.match(claim, /Math\.max\(1, Math\.min\(limit, 50\)\)/);
    assert.match(claim, /db\.transaction/);
    assert.match(claim, /for\("update", \{ skipLocked: true \}\)/);
    assert.match(claim, /status: "sending"/);
    assert.match(claim, /status, "sending"[\s\S]*staleLease/);
  });

  it("adds auth tables without rewriting legacy authors or access tokens", () => {
    for (const table of [
      "author_accounts",
      "author_emails",
      "author_auth_challenges",
      "author_sessions",
      "email_outbox",
    ]) {
      assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
    }
    assert.doesNotMatch(migration, /(?:DROP|TRUNCATE|UPDATE|DELETE FROM) "?authors"?/i);
    assert.doesNotMatch(migration, /(?:DROP|TRUNCATE|UPDATE|DELETE FROM) "?author_access_tokens"?/i);
    assert.doesNotMatch(migration, /ALTER TABLE "authors"/);
    assert.doesNotMatch(migration, /ALTER TABLE "author_access_tokens"/);
  });

  it("verifies email only through a rate-limited POST action", () => {
    assert.match(verifyPage, /<form action=\{verifyAuthorEmailAction\}/);
    assert.doesNotMatch(verifyPage, /verifyAuthorEmailChallenge|hashAuthorAuthChallengeToken/);
    assert.match(verifyActions, /checkAuthorAuthMutationRateLimit\("author-verify", token\)/);
    assert.match(verifyActions, /verifyAuthorEmailChallenge\(hashAuthorAuthChallengeToken\(token\)\)/);
  });

  it("rate limits public auth mutations by their own scopes", () => {
    assert.match(registrationActions, /checkAuthorAuthMutationRateLimit\("author-register"/);
    assert.match(onboardingActions, /checkAuthorAuthMutationRateLimit\("author-onboarding"/);
    assert.match(onboardingActions, /checkAuthorAuthMutationRateLimit\("author-verify"/);
    assert.match(forgotActions, /checkAuthorAuthMutationRateLimit\("author-forgot"/);
  });

  it("sets the registration timing field on the client and validates the honeypot", () => {
    assert.match(registrationPage, /<RegistrationStartedAtInput \/>/);
    assert.match(registrationPage, /name="website"/);
    assert.match(registrationTimestamp, /"use client"/);
    assert.match(registrationTimestamp, /useEffect\(\(\) => \{/);
    assert.match(registrationTimestamp, /String\(Date\.now\(\)\)/);
    assert.match(registrationActions, /honeypot \|\| !Number\.isFinite\(formStartedAt\)/);
    assert.match(registrationActions, /fillTime < 1500 \|\| fillTime > 60 \* 60 \* 1000/);
  });

  it("invalidates previous verification challenges when resending", () => {
    const resend = functionSource(operations, "resendAuthorEmailVerification", "resetAuthorPassword");
    const invalidateIndex = resend.indexOf(".set({ consumedAt: now })");
    const insertIndex = resend.indexOf(".insert(authorAuthChallenges)");
    assert.ok(invalidateIndex >= 0 && insertIndex > invalidateIndex);
    assert.match(resend, /eq\(authorAuthChallenges\.purpose, "verify_email"\)/);
    assert.match(resend, /isNull\(authorAuthChallenges\.consumedAt\)/);
  });

  it("keeps forgot-password success generic for unknown identities", () => {
    assert.match(forgotActions, /const account = email \? await getActiveAuthorAccountByPrimaryEmail/);
    assert.match(forgotActions, /if \(account\) \{/);
    assert.match(forgotActions, /redirect\("\/author\/forgot-password\?sent=1"\)/);
    assert.doesNotMatch(forgotActions, /not-found|unknown-email|account-missing/);
  });

  it("logs security settings mutations and notifies the previous email", () => {
    for (const action of [
      "author.password.changed",
      "author.updated",
      "author.email.changed",
      "author.session.revoked",
    ]) {
      assert.match(settingsActions, new RegExp(`action: "${action.replaceAll(".", "\\.")}"`));
    }
    const verify = functionSource(operations, "verifyAuthorEmailChallenge", "requestAuthorEmailChange");
    assert.match(verify, /template: "email_changed"/);
    assert.match(verify, /recipient: oldPrimary\.email/);
  });

  it("invalidates sibling reset and email-change challenges after success", () => {
    const reset = functionSource(operations, "resetAuthorPassword", "reviewAuthorRegistration");
    assert.match(reset, /returning\(\{ authorId: authorAccounts\.authorId \}\)/);
    assert.match(reset, /if \(!updatedAccount\) return false/);
    assert.match(reset, /eq\(authorAuthChallenges\.purpose, "reset_password"\)[\s\S]*isNull\(authorAuthChallenges\.consumedAt\)/);
    const verify = functionSource(operations, "verifyAuthorEmailChallenge", "requestAuthorEmailChange");
    assert.match(verify, /eq\(authorAuthChallenges\.purpose, "change_email"\)[\s\S]*isNull\(authorAuthChallenges\.consumedAt\)/);
    assert.match(verify, /delete\(authorEmails\)[\s\S]*eq\(authorEmails\.isPrimary, false\)/);
  });

  it("serializes admin registration decisions and fails closed without email delivery", () => {
    const review = functionSource(operations, "reviewAuthorRegistration", "cleanupAuthorAuthData");
    assert.match(review, /for\("update", \{ of: authorAccounts \}\)/);
    assert.match(operations, /onboardExistingAuthor[\s\S]*isAuthorEmailDeliveryConfigured\(\)/);
    assert.match(operations, /registerAuthorAccount[\s\S]*isAuthorEmailDeliveryConfigured\(\)/);
    assert.match(registrationActions, /!\(await isAuthorEmailDeliveryConfigured\(\)\)/);
    assert.match(onboardingActions, /!\(await isAuthorEmailDeliveryConfigured\(\)\)/);
  });
});
