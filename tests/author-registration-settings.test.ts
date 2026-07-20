import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("migration and schema define singleton author registration settings", () => {
  const schema = read("src/db/schema.ts");
  const migration = read("drizzle/0033_author_registration_settings.sql");
  const journal = read("drizzle/meta/_journal.json");

  assert.match(schema, /authorRegistrationSettings = pgTable\([\s\S]*"author_registration_settings"/);
  assert.match(schema, /author_registration_settings_singleton_id_check/);
  assert.match(migration, /CHECK \("author_registration_settings"\."id" = 1\)/);
  assert.match(migration, /ON DELETE restrict/);
  assert.match(migration, /ON DELETE set null/);
  assert.match(migration, /VALUES \(1, NULL\)/);
  assert.match(journal, /0033_author_registration_settings/);
});

test("resolver keeps database, environment, automatic precedence and excludes system profiles", () => {
  const source = read("src/db/queries/author-registration-settings.ts");
  const databaseBranch = source.indexOf('source: "database"');
  const environmentBranch = source.indexOf('source: "environment"');
  const automaticBranch = source.indexOf('source: "automatic"');

  assert.ok(databaseBranch > 0 && databaseBranch < environmentBranch);
  assert.ok(environmentBranch < automaticBranch);
  assert.match(source, /AUTHOR_REGISTRATION_ACCESS_PROFILE_CODE/);
  assert.match(source, /eq\(authorAccessProfiles\.isSystem, false\)/);
  assert.match(source, /maxDraftMediaItems}[\s\S]*nulls last/);
});

test("registration resolves the profile inside its existing transaction", () => {
  const operation = read("src/db/operations/author-auth.ts");
  assert.match(operation, /db\.transaction\(async \(tx\) => \{[\s\S]*resolveAuthorRegistrationAccessProfile\(tx\)[\s\S]*accessProfileId: registrationProfile\.id/);
});

test("admin action prepares audit data and atomically persists setting with its activity log", () => {
  const action = read("src/app/admin/(protected)/settings/authors/actions.ts");
  const query = read("src/db/queries/author-registration-settings.ts");

  assert.match(action, /requireAdminUser\(\)/);
  assert.match(action, /Number\.isInteger\(accessProfileId\)/);
  assert.match(action, /prepareActivityLog\(\{[\s\S]*author\.registration-settings\.updated/);
  assert.match(action, /saveAuthorRegistrationAccessProfile\(\{[\s\S]*activityLog/);
  assert.doesNotMatch(action, /logActivity\(/);
  assert.match(query, /db\.transaction\(async \(tx\) => \{[\s\S]*insert\(authorRegistrationSettings\)[\s\S]*tx\.insert\(adminActivityLogs\)/);
  assert.match(query, /oldAccessProfileId:[\s\S]*newAccessProfileId:[\s\S]*newAccessProfileCode:/);
  assert.match(query, /onConflictDoUpdate/);
  assert.match(query, /eq\(authorAccessProfiles\.isSystem, false\)/);
});

test("prepared activity path reuses sanitization, severity defaults and security request metadata", () => {
  const server = read("src/lib/activity-logs/server.ts");

  assert.match(server, /prepareActivityLog[\s\S]*getSecurityRequestMetadata\(input\.action\)/);
  assert.match(server, /getDefaultActivitySeverity/);
  assert.match(server, /sanitizeActivityLogMetadata\(input\.metadata\)/);
  assert.match(server, /createActivityLog\(await prepareActivityLog\(input\)\)/);
});

test("authors settings UI explains scope, fallbacks, required selection and empty state", () => {
  const page = read("src/app/admin/(protected)/settings/authors/page.tsx");
  const navigation = read("src/app/admin/(protected)/settings/settings-nav.tsx");

  assert.match(navigation, /\/admin\/settings\/authors/);
  assert.match(navigation, /label: "Авторы"/);
  assert.match(page, /только для будущих регистраций/);
  assert.match(page, /при одобрении профиль можно изменить/);
  assert.match(page, /AUTHOR_REGISTRATION_ACCESS_PROFILE_CODE/);
  assert.match(page, /required/);
  assert.match(page, /Нет несистемных профилей/);
});

test("registration default profile deletion has a specific protected result and message", () => {
  const query = read("src/db/queries/author-access-profiles.ts");
  const action = read("src/app/admin/(protected)/access-profiles/actions.ts");
  const messages = read("src/app/admin/(protected)/access-profiles/messages.ts");

  assert.match(query, /authorRegistrationSettings\.accessProfileId/);
  assert.match(query, /return "registration-default"/);
  assert.match(action, /profile-is-registration-default/);
  assert.match(messages, /Нельзя удалить профиль: он выбран для новых авторов/);
});
