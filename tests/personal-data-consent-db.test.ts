import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { CURRENT_CONSENT_VERSION } from "../src/lib/privacy/consent";

const databaseUrl = process.env.CONSENT_TEST_DATABASE_URL;

test("consent migration, idempotence, withdrawal history, rollback and settings", { skip: !databaseUrl }, async () => {
  const { default: postgres } = await import("postgres");
  const admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  const schema = `consent_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema} -c lock_timeout=3000`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "4";
  const { db, getDbClient } = await import("../src/db");
  const client = getDbClient();
  const consent = await import("../src/db/queries/personal-data-consent");
  try {
    await client.unsafe(`create table authors(id serial primary key);
      insert into authors values(1),(2);
      create table author_sessions(id integer primary key,author_id integer,token_hash text,revoked_at timestamptz);
      insert into author_sessions values(1,1,'existing-session',null);`);
    const before = await client`select * from author_sessions`;
    await client.unsafe(await readFile(new URL("../drizzle-archive/pre-baseline/0159_personal_data_consent.sql", import.meta.url), "utf8"));
    await client`insert into personal_data_consent_settings(id,operator_details,contact) values(1,'До миграции','old@example.test')`;
    await client.unsafe(await readFile(new URL("../drizzle-archive/pre-baseline/0161_personal_data_consent_requirement.sql", import.meta.url), "utf8"));
    assert.deepEqual(await consent.getPersonalDataConsentSettings(), { requireConsent: false, operatorDetails: "До миграции", contact: "old@example.test" });
    await client`delete from personal_data_consent_settings`;
    assert.deepEqual(await client`select * from author_sessions`, before);
    assert.equal(await consent.isPersonalDataConsentRequired(), false);
    assert.equal(await consent.hasRequiredPersonalDataConsent(1), true);
    assert.equal(await consent.hasCurrentPersonalDataConsent(1), false);
    assert.equal(await consent.acceptPersonalDataConsent(1, "older"), false);
    assert.equal((await client`select * from personal_data_consents`).length, 0);
    assert.deepEqual(await consent.getPersonalDataConsentSettings(), { requireConsent: false, operatorDetails: "", contact: "" });
    await consent.savePersonalDataConsentSettings({ requireConsent: true, operatorDetails: "Тестовый оператор", contact: "test@example.test" });
    assert.equal((await consent.getPersonalDataConsentSettings()).contact, "test@example.test");
    await Promise.all(Array.from({ length: 4 }, () => consent.acceptPersonalDataConsent(1, CURRENT_CONSENT_VERSION)));
    const [first] = await client`select * from personal_data_consents where author_id=1`;
    assert.equal((await client`select * from personal_data_consents where author_id=1`).length, 1);
    assert.equal(await consent.hasCurrentPersonalDataConsent(1), true);
    await consent.savePersonalDataConsentSettings({ requireConsent: false, operatorDetails: "Тестовый оператор", contact: "test@example.test" });
    assert.equal(await consent.hasRequiredPersonalDataConsent(2), true);
    assert.equal((await client`select * from personal_data_consents where author_id=1`).length, 1);
    await consent.savePersonalDataConsentSettings({ requireConsent: true, operatorDetails: "Тестовый оператор", contact: "test@example.test" });
    assert.equal(await consent.hasRequiredPersonalDataConsent(1), true);
    assert.equal(await consent.hasRequiredPersonalDataConsent(2), false);
    await consent.revokePersonalDataConsent(1);
    assert.equal(await consent.hasCurrentPersonalDataConsent(1), false);
    await consent.acceptPersonalDataConsent(1, CURRENT_CONSENT_VERSION);
    const history = await client`select * from personal_data_consents where author_id=1 order by id`;
    assert.equal(history.length, 2);
    assert.deepEqual(history[0].accepted_at, first.accepted_at);
    assert.ok(history[0].revoked_at);
    assert.equal(history[1].revoked_at, null);
    await assert.rejects(db.transaction(async (tx) => {
      await consent.insertPersonalDataConsent(tx, 2, CURRENT_CONSENT_VERSION);
      throw new Error("registration failed");
    }), /registration failed/);
    assert.equal(await consent.hasCurrentPersonalDataConsent(2), false);
    await client`insert into personal_data_consents(author_id,version) values(2,'older')`;
    assert.equal(await consent.hasCurrentPersonalDataConsent(2), false);
    await assert.rejects(client`insert into personal_data_consents(author_id,version) values(1,${CURRENT_CONSENT_VERSION})`, /personal_data_consents_active_unique/);
    await assert.rejects(client`insert into personal_data_consent_settings(id) values(2)`, /singleton_check/);
    // Deleting an account removes only its own history; existing sessions were not migrated.
    await client`delete from authors where id=1`;
    assert.equal((await client`select * from personal_data_consents where author_id=1`).length, 0);
    assert.equal((await client`select * from personal_data_consents where author_id=2`).length, 1);
  } finally {
    await client.end({ timeout: 1 });
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end({ timeout: 1 });
  }
});
