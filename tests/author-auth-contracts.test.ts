import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const queries = readFileSync("src/db/queries/author-auth.ts", "utf8");
const operations = readFileSync("src/db/operations/author-auth.ts", "utf8");
const loginActions = readFileSync("src/app/author/login/actions.ts", "utf8");
const loginForm = readFileSync("src/app/author/login/author-login-form.tsx", "utf8");
const registrationActions = readFileSync("src/app/author/register/actions.ts", "utf8");
const registrationPage = readFileSync("src/app/author/register/page.tsx", "utf8");
const profilePage = readFileSync("src/app/author/(protected)/profile/page.tsx", "utf8");
const legacyOnboardingPage = readFileSync("src/app/author/onboarding/page.tsx", "utf8");
const resetPasswordPage = readFileSync("src/app/author/reset-password/page.tsx", "utf8");
const legacySecurityPage = readFileSync("src/app/author/(protected)/settings/security/page.tsx", "utf8");
const passwordField = readFileSync("src/components/auth/password-field.tsx", "utf8");
const registrationTimestamp = readFileSync(
  "src/app/author/register/registration-started-at-input.tsx",
  "utf8",
);
const profileActions = readFileSync("src/app/author/(protected)/profile/actions.ts", "utf8");
const forgotActions = readFileSync("src/app/author/forgot-password/actions.ts", "utf8");
const verifyPage = readFileSync("src/app/author/verify-email/page.tsx", "utf8");
const verifyActions = readFileSync("src/app/author/verify-email/actions.ts", "utf8");
const adminNavigation = readFileSync("src/app/admin/(protected)/admin-nav-menu.tsx", "utf8");
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
      assert.match(source, /gt\(authorAuthChallenges\.expiresAt, now\)/);
    }
  });

  it("activates every author immediately after verifying the registration email", () => {
    const verify = functionSource(operations, "verifyAuthorEmailChallenge", "requestAuthorEmailChange");
    assert.match(verify, /set\(\{ status: "active", updatedAt: now \}\)/);
    assert.match(verify, /eq\(authorAccounts\.status, "pending_email"\)/);
    assert.match(verify, /if \(!activatedAccount\) return null/);
    assert.match(verify, /status: "active" as const, purpose: "verify_email" as const/);
    assert.doesNotMatch(verify, /legacyToken|pending_approval|registration_approved|registration_rejected/);
    assert.match(verifyActions, /result \? "\/author\/login\?verified=1"/);
    assert.doesNotMatch(verifyActions, /pending=1/);
    assert.match(operations, /status: "pending_email"/);
    assert.match(profileActions, /current\.session\.authMethod !== "access_token"/);
    assert.doesNotMatch(profileActions, /isFreshAccessTokenSession|15 \* 60/);
    assert.match(profileActions, /getAuthorAccountByAuthorId\(current\.author\.id\)/);
    assert.match(registrationActions, /redirect\("\/author\/register\?sent=1"\)/);
    assert.match(registrationPage, /export const dynamic = "force-dynamic"/);
    assert.match(registrationPage, /if \(!isAuthorRegistrationEnabled\(\)\) notFound\(\)/);
    assert.match(registrationPage, /Регистрация временно недоступна: отправка писем ещё не настроена/);
    assert.doesNotMatch(
      registrationPage,
      /!isAuthorRegistrationEnabled\(\) \|\| !\(await isAuthorEmailDeliveryConfigured\(\)\)\) notFound/,
    );
  });

  it("uses the informative password strength field only for new passwords", () => {
    for (const page of [registrationPage, resetPasswordPage, profilePage]) {
      assert.match(page, /<PasswordField[\s\S]*name="password"/);
      assert.match(page, /autoComplete="new-password"/);
      assert.match(page, /minLength=\{AUTHOR_PASSWORD_MIN_LENGTH\}/);
      assert.match(page, /maxLength=\{AUTHOR_PASSWORD_MAX_LENGTH\}/);
    }
    assert.match(registrationPage, /name="passwordConfirmation"[\s\S]*minLength=\{AUTHOR_PASSWORD_MIN_LENGTH\}[\s\S]*maxLength=\{AUTHOR_PASSWORD_MAX_LENGTH\}/);
    assert.match(profilePage, /name="passwordConfirmation"[\s\S]*minLength=\{AUTHOR_PASSWORD_MIN_LENGTH\}[\s\S]*maxLength=\{AUTHOR_PASSWORD_MAX_LENGTH\}/);
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

    assert.match(profilePage, /<Label htmlFor="newPassword">Новый пароль<\/Label><PasswordField id="newPassword" name="password"/);
    assert.match(profilePage, /name="currentPassword" type="password" autoComplete="current-password"/);
    assert.doesNotMatch(profilePage, /name="currentPassword"[^>]*(?:minLength|maxLength)=/);
  });

  it("removes the registration review route while retaining historic model values", () => {
    assert.doesNotMatch(operations, /reviewAuthorRegistration|template: "registration_(?:approved|rejected)"/);
    assert.doesNotMatch(queries, /getPendingAuthorRegistrations/);
    assert.doesNotMatch(adminNavigation, /\/admin\/registration-review/);
    assert.match(readFileSync("src/lib/auth/author-account-model.ts", "utf8"), /pending_approval[\s\S]*rejected[\s\S]*registration_approved[\s\S]*registration_rejected/);
  });

  it("keeps login failures generic and always performs password verification", () => {
    const passwordLogin = functionSource(loginActions, "loginAuthorWithPasswordInline", "loginAuthorInline");
    assert.match(passwordLogin, /verifyPasswordOrDummy\(password, account\?\.passwordHash\)/);
    assert.match(passwordLogin, /if \(!account \|\| !passwordMatches\)/);
    assert.match(passwordLogin, /return \{ ok: false, error: "invalid" \}/);
    assert.doesNotMatch(passwordLogin, /not-found|wrong-password|pending_approval|rejected/);
  });

  it("applies the documented session revocation policy", () => {
    const reset = functionSource(operations, "resetAuthorPassword", "cleanupAuthorAuthData");
    assert.match(reset, /update\(authorSessions\)[\s\S]*eq\(authorSessions\.authorId, challenge\.authorId\)/);
    assert.match(profileActions, /revokeAllAuthorSessions\(current\.author\.id, current\.session\.sessionId\)/);
    assert.match(profileActions, /intent === "all"[\s\S]*revokeAllAuthorSessions\(current\.author\.id\)/);
    assert.match(profileActions, /revokeAuthorSessionById\(current\.author\.id, sessionId\)/);
  });

  it("switches email only after consuming its challenge and revokes sessions", () => {
    const verify = functionSource(operations, "verifyAuthorEmailChallenge", "requestAuthorEmailChange");
    assert.match(verify, /challenge\.purpose === "change_email"/);
    assert.match(verify, /set\(\{ isPrimary: false/);
    assert.match(verify, /set\(\{ isPrimary: true, verifiedAt: now/);
    assert.match(verify, /update\(authorSessions\)\.set\(\{ revokedAt: now \}\)/);
    assert.match(profileActions, /updated=email-pending/);
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

  it("automatically verifies a fragment token through the rate-limited POST action", () => {
    assert.match(verifyPage, /new URLSearchParams\(url\.hash\.slice\(1\)\)/);
    assert.match(verifyPage, /url\.searchParams\.get\("token"\)/);
    assert.match(verifyPage, /url\.searchParams\.delete\("token"\)/);
    assert.match(verifyPage, /window\.history\.replaceState/);
    assert.match(verifyPage, /formRef\.current\.requestSubmit\(\)/);
    assert.match(verifyPage, /action=\{verifyAuthorEmailAction\}/);
    assert.doesNotMatch(verifyPage, /Подтвердить email<\/Button>|verifyAuthorEmailChallenge|hashAuthorAuthChallengeToken/);
    assert.match(verifyActions, /checkAuthorAuthMutationRateLimit\("author-verify", token\)/);
    assert.match(verifyActions, /verifyAuthorEmailChallenge\(hashAuthorAuthChallengeToken\(token\)\)/);
  });

  it("rate limits public auth mutations by their own scopes", () => {
    assert.match(registrationActions, /checkAuthorAuthMutationRateLimit\("author-register"/);
    assert.match(profileActions, /checkAuthorAuthMutationRateLimit\("author-onboarding"/);
    assert.match(profileActions, /checkAuthorAuthMutationRateLimit\("author-verify"/);
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
      "author.email.changed",
      "author.session.revoked",
    ]) {
      assert.match(profileActions, new RegExp(`action: "${action.replaceAll(".", "\\.")}"`));
    }
    const verify = functionSource(operations, "verifyAuthorEmailChallenge", "requestAuthorEmailChange");
    assert.match(verify, /template: "email_changed"/);
    assert.match(verify, /recipient: oldPrimary\.email/);
  });

  it("invalidates sibling reset and email-change challenges after success", () => {
    const reset = functionSource(operations, "resetAuthorPassword", "cleanupAuthorAuthData");
    assert.match(reset, /returning\(\{ authorId: authorAccounts\.authorId \}\)/);
    assert.match(reset, /if \(!updatedAccount\) return false/);
    assert.match(reset, /eq\(authorAuthChallenges\.purpose, "reset_password"\)[\s\S]*isNull\(authorAuthChallenges\.consumedAt\)/);
    const verify = functionSource(operations, "verifyAuthorEmailChallenge", "requestAuthorEmailChange");
    assert.match(verify, /eq\(authorAuthChallenges\.purpose, "change_email"\)[\s\S]*isNull\(authorAuthChallenges\.consumedAt\)/);
    assert.match(verify, /delete\(authorEmails\)[\s\S]*eq\(authorEmails\.isPrimary, false\)/);
  });

  it("fails closed without email delivery for registration and onboarding", () => {
    assert.match(operations, /onboardExistingAuthor[\s\S]*isAuthorEmailDeliveryConfigured\(\)/);
    assert.match(operations, /registerAuthorAccount[\s\S]*isAuthorEmailDeliveryConfigured\(\)/);
    assert.match(registrationActions, /!\(await isAuthorEmailDeliveryConfigured\(\)\)/);
    assert.match(profileActions, /!\(await isAuthorEmailDeliveryConfigured\(\)\)/);
  });

  it("uses one canonical protected profile and redirects legacy routes", () => {
    const layout = readFileSync("src/app/author/(protected)/layout.tsx", "utf8");
    assert.match(layout, /href="\/author\/profile"[\s\S]*Профиль/);
    assert.match(legacyOnboardingPage, /redirectToAuthorProfile\(searchParams\)/);
    assert.match(legacySecurityPage, /redirectToAuthorProfile\(searchParams\)/);
    assert.match(profilePage, /value=\{account\.login \?\? ""\}[\s\S]*Логин задаётся один раз и не изменяется/);
    assert.doesNotMatch(profilePage, /changeAuthorLoginAction|Сменить логин/);
    assert.doesNotMatch(profileActions, /changeAuthorLoginAction|Автор изменил логин/);
    assert.match(profilePage, /id="profileLogin"[\s\S]*disabled/);
    assert.match(profileActions, /function readPassword[\s\S]*return typeof value === "string" \? value : ""/);
  });

  it("loads profile email state without normalized credentials", () => {
    const source = functionSource(queries, "getAuthorProfileAccountState", "getAuthorSessions");
    assert.match(source, /login: authorAccounts\.login/);
    assert.match(source, /primaryEmail: authorEmails\.email/);
    assert.doesNotMatch(source, /normalizedLogin|normalizedEmail/);
  });

  it("returns verified same-browser authors to profile and clears changed-email sessions", () => {
    assert.match(verifyActions, /getCurrentAuthorSession\(\)/);
    assert.match(verifyActions, /current\?\.author\.id === result\.authorId[\s\S]*clearAuthorSessionCookie\(\)/);
    assert.match(verifyActions, /\/author\/profile\?verified=1/);
    assert.match(verifyActions, /author\.email\.changed[\s\S]*stage: "confirmed"/);
    assert.match(verifyActions, /\/author\/login\?emailChanged=1/);
  });
});
