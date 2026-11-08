import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const databaseUrl = process.env.EXTERNAL_AUTH_TEST_DATABASE_URL;

test("external auth: atomic registration, linking, unlinking, profile ownership and account states", { skip: !databaseUrl }, async (t) => {
  const { default: postgres } = await import("postgres");
  const admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  const schema = `external_auth_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema} -c lock_timeout=3000`);
  url.searchParams.set("application_name", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "8";
  process.env.EMAIL_OUTBOX_ENCRYPTION_KEY = "external-auth-test-only";
  process.env.EMAIL_PROVIDER_CREDENTIALS_KEY = "external-auth-test-only-credential-key";
  process.env.SITE_URL = "http://localhost:3000";
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  try {
    await client.unsafe(`
      create table author_access_profiles(id serial primary key,code text unique,name text,is_system boolean default false,
        can_publish_media_without_review boolean default false,can_publish_franchises_without_review boolean default false,
        max_draft_media_items int,max_draft_media_items_per_day int);
      insert into author_access_profiles(code,name) values('default','Default');
      create table author_registration_settings(id int primary key,access_profile_id int);
      create table authors(id serial primary key,merged_into_author_id int,code text not null unique,name text not null,avatar_object_key text unique,
        is_system boolean not null default false,is_discoverable boolean not null default true,access_profile_id int not null references author_access_profiles(id),
        blocked_at timestamptz,blocked_by_admin_id int,created_at timestamptz default now(),updated_at timestamptz default now());
      create table author_accounts(author_id int primary key references authors(id) on delete cascade,login text not null,normalized_login text not null unique,
        password_hash text not null,status text not null,approved_at timestamptz,approved_by_admin_id int,rejected_at timestamptz,rejected_by_admin_id int,
        created_at timestamptz default now(),updated_at timestamptz default now());
      create table author_emails(id serial primary key,author_id int references authors(id) on delete cascade,email text,normalized_email text unique,
        verified_at timestamptz,is_primary boolean default false,created_at timestamptz default now(),updated_at timestamptz default now());
      create table author_auth_identities(id serial primary key,author_id int not null references authors(id) on delete cascade,
        provider text not null,provider_subject text not null,display_value text,verified_at timestamptz,last_used_at timestamptz,
        created_at timestamptz default now(),updated_at timestamptz default now(),
        constraint author_auth_identities_provider_subject_unique unique(provider,provider_subject));
      create table author_sessions(id serial primary key,author_id int not null references authors(id) on delete cascade,
        token_hash text not null unique,auth_method text not null,created_at timestamptz default now(),last_seen_at timestamptz default now(),
        expires_at timestamptz not null,revoked_at timestamptz,ip_address text,user_agent text,
        constraint author_sessions_auth_method_check check(auth_method in ('password','access_token','telegram')));
      create table author_access_tokens(id serial primary key,author_id int references authors(id),token_hash text unique,label text,
        created_by_admin_id int,created_at timestamptz default now(),last_used_at timestamptz,revoked_at timestamptz);
      create table author_auth_challenges(id serial primary key,author_id int references authors(id),email_id int references author_emails(id),
        purpose text,token_hash text unique,expires_at timestamptz,consumed_at timestamptz,created_at timestamptz default now());
      create table email_outbox(id serial primary key,template text,recipient text,encrypted_payload text,lease_token text,status text default 'pending',attempts int default 0,next_attempt_at timestamptz default now(),sent_at timestamptz,last_error text,created_at timestamptz default now(),updated_at timestamptz default now());
      create table domain_events(id uuid primary key default gen_random_uuid(),type text not null,schema_version int default 1,
        actor_author_id int,aggregate_type text,aggregate_id text,payload jsonb default '{}',occurred_at timestamptz default now());
      create table domain_event_outbox(event_id uuid primary key references domain_events(id),dispatched_at timestamptz,
        next_attempt_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now());
      create table job_runs(id serial primary key,job_id int,retry_of_run_id int,created_by_admin_id int,type text,payload jsonb,source text,
        status text default 'queued',scheduled_for timestamptz,available_at timestamptz,attempts int default 0,max_attempts int,timeout_seconds int,
        retry_base_seconds int,retry_max_seconds int,locked_at timestamptz,locked_by text,lock_token text,lock_expires_at timestamptz,
        started_at timestamptz,finished_at timestamptz,cancelled_at timestamptz,error_code text,error_message text,
        created_at timestamptz default now(),updated_at timestamptz default now());
      create table email_delivery_settings(id int primary key,provider text,enabled boolean,encrypted_api_key text,api_key_hint text,
        from_name text,from_email text,reply_to text,updated_by_admin_id int,created_at timestamptz default now(),updated_at timestamptz default now());
    `);
    const migration = await readFile(new URL("../drizzle-archive/pre-baseline/0157_external_auth.sql", import.meta.url), "utf8");
    await t.test("migration rejects duplicate author/provider and preserves legacy sessions", async () => {
      const [legacy] = await client`insert into authors(code,name,access_profile_id) values('legacy','Legacy',1) returning id`;
      await client`insert into author_auth_identities(author_id,provider,provider_subject) values(${legacy.id},'telegram','first'),(${legacy.id},'telegram','second')`;
      await assert.rejects(client.unsafe(migration), /Duplicate author\/provider identities/);
      await client`delete from author_auth_identities where provider_subject='second'`;
      await client`insert into author_sessions(author_id,token_hash,auth_method,expires_at) values(${legacy.id},'legacy-token','telegram',now()+interval '1 day')`;
      await client.unsafe(migration);
      const [session] = await client`select * from author_sessions where token_hash='legacy-token'`;
      assert.equal(session.auth_method, "telegram");
      assert.equal(session.identity_id, null);
      assert.equal(session.provider, null);
      assert.equal(session.revoked_at, null);
      await client`delete from authors where id=${legacy.id}`;
    });
    const { completeExternalAuth, unlinkExternalAuthIdentity, commitExternalAvatar } = await import("../src/db/operations/external-auth");
    const { updateAuthorDisplayName, replaceAuthorAvatarObjectKey } = await import("../src/db/queries/authors");
    const { getActiveAuthorSessionByTokenHash, updateAuthorAccountStatus } = await import("../src/db/queries/author-auth");
    const { hashAuthorSessionToken } = await import("../src/lib/auth/author-session");
    const login = (subject: string, provider = "one", name?: string) => completeExternalAuth({ intent: "login", provider, subject, name });
    const sessionId = async (token: string | undefined) => {
      assert.ok(token);
      const session = await getActiveAuthorSessionByTokenHash(hashAuthorSessionToken(token));
      assert.ok(session);
      return session.sessionId;
    };
    const eventCount = async (authorId: number) => Number((await client`select count(*) as n from domain_events where type='author.registration.submitted' and aggregate_type='author' and aggregate_id=${String(authorId)}`)[0].n);
    await t.test("same-subject registration races create one author, identity and event", async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => login("race", "one", "Имя")));
      assert.equal(new Set(results.map(r => r.authorId)).size, 1);
      assert.equal(new Set(results.map(r => r.identityId)).size, 1);
      const result = results[0];
      assert.equal((await client`select * from authors`).length, 1);
      assert.equal(await eventCount(result.authorId), 1);
      assert.equal((await client`select * from domain_event_outbox`).length, 1);
      assert.equal((await client`select * from author_sessions`).length, 6);
      assert.equal(result.avatarSourceIdentityId, result.identityId);
      assert.equal((await client`select name_source_identity_id from authors where id=${result.authorId}`)[0].name_source_identity_id, result.identityId);
      assert.ok((await client`select last_used_at from author_auth_identities where id=${result.identityId}`)[0].last_used_at);
    });
    await t.test("link is idempotent, preserves profile and rejects conflicts and stale sessions", async () => {
      const a = await login("link-owner");
      const sid = await sessionId(a.token);
      const input = { intent: "link" as const, provider: "two", subject: "linked", authorId: a.authorId, sessionId: sid, name: "Другое имя" };
      const links = await Promise.all([completeExternalAuth(input), completeExternalAuth(input)]);
      assert.equal(links[0].identityId, links[1].identityId);
      assert.equal(links[0].token, undefined);
      const [profile] = await client`select * from authors where id=${a.authorId}`;
      assert.equal(profile.name, "Пользователь");
      assert.equal(profile.avatar_source_identity_id, a.identityId);
      await assert.rejects(completeExternalAuth({ ...input, subject: "second" }), { code: "conflict" });
      const b = await login("other-owner");
      await assert.rejects(completeExternalAuth({ ...input, authorId: b.authorId, sessionId: await sessionId(b.token) }), { code: "conflict" });
      await client`update author_sessions set revoked_at=now() where id=${sid}`;
      await assert.rejects(completeExternalAuth(input), { code: "session-changed" });
    });
    await t.test("manual edits release sources and version fencing rejects stale avatar work", async () => {
      const a = await login("profile", "one", "Исходное имя");
      await login("profile", "one", "Обновлённое имя");
      assert.equal((await client`select name from authors where id=${a.authorId}`)[0].name, "Обновлённое имя");
      await login("profile", "one", "А".repeat(81));
      assert.equal((await client`select name from authors where id=${a.authorId}`)[0].name, "Обновлённое имя");
      const avatars = await Promise.all(["first", "second"].map(objectKey => commitExternalAvatar({ authorId: a.authorId, identityId: a.identityId, expectedVersion: 0, objectKey })));
      assert.equal(avatars.filter(a => a.applied).length, 1);
      await updateAuthorDisplayName(a.authorId, "Моё имя");
      await replaceAuthorAvatarObjectKey({ authorId: a.authorId, objectKey: "manual" });
      await login("profile", "one", "Чужое имя");
      const [row] = await client`select * from authors where id=${a.authorId}`;
      assert.equal(row.name, "Моё имя");
      assert.equal(row.name_source_identity_id, null);
      assert.equal(row.avatar_source_identity_id, null);
      assert.equal(row.avatar_version, 2);
      assert.equal((await commitExternalAvatar({ authorId: a.authorId, identityId: a.identityId, expectedVersion: 2, objectKey: "stale" })).applied, false);
    });
    await t.test("unlink uses available alternatives, clears sources, revokes only linked sessions and preserves provider", async () => {
      const a = await login("unlink");
      const sid = await sessionId(a.token);
      await assert.rejects(unlinkExternalAuthIdentity({ authorId: a.authorId, sessionId: sid, identityId: a.identityId, availableProviders: ["one"] }), { code: "last-method" });
      const linked = await completeExternalAuth({ intent: "link", provider: "two", subject: "unlink-other", authorId: a.authorId, sessionId: sid });
      await assert.rejects(unlinkExternalAuthIdentity({ authorId: a.authorId, sessionId: sid, identityId: a.identityId, availableProviders: ["one"] }), { code: "last-method" });
      const other = await login("unlink-other", "two");
      const result = await unlinkExternalAuthIdentity({ authorId: a.authorId, sessionId: sid, identityId: a.identityId, availableProviders: ["one", "two"] });
      assert.equal(result.currentSessionRevoked, true);
      const [oldSession] = await client`select * from author_sessions where id=${sid}`;
      assert.ok(oldSession.revoked_at);
      assert.equal(oldSession.identity_id, null);
      assert.equal(oldSession.provider, "one");
      assert.ok(await sessionId(other.token));
      const [profile] = await client`select * from authors where id=${a.authorId}`;
      assert.equal(profile.name_source_identity_id, null);
      assert.equal(profile.avatar_source_identity_id, null);
      assert.equal((await commitExternalAvatar({ authorId: a.authorId, identityId: a.identityId, expectedVersion: 0, objectKey: "gone" })).applied, false);
      assert.equal((await client`select * from author_auth_identities where id=${linked.identityId}`).length, 1);
    });
    await t.test("concurrent opposite unlinks retain one usable credential", async () => {
      const a = await login("unlink-race");
      const sid = await sessionId(a.token);
      const b = await completeExternalAuth({ intent: "link", provider: "two", subject: "unlink-race-two", authorId: a.authorId, sessionId: sid });
      const secondSession = await login("unlink-race-two", "two");
      const results = await Promise.allSettled([
        unlinkExternalAuthIdentity({ authorId: a.authorId, sessionId: sid, identityId: a.identityId, availableProviders: ["one", "two"] }),
        unlinkExternalAuthIdentity({ authorId: a.authorId, sessionId: await sessionId(secondSession.token), identityId: b.identityId, availableProviders: ["one", "two"] }),
      ]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal((await client`select * from author_auth_identities where author_id=${a.authorId}`).length, 1);
    });
    await t.test("blocked/system/rejected/pending approval cannot login; pending email can", async () => {
      for (const status of ["active", "pending_email", "pending_approval", "rejected"]) {
        const a = await login(`status-${status}`);
        await client`insert into author_accounts(author_id,login,normalized_login,password_hash,status) values(${a.authorId},${status},${status},'hash',${status})`;
        if (status === "active" || status === "pending_email") {
          await sessionId((await login(`status-${status}`)).token);
        } else {
          await assert.rejects(login(`status-${status}`), { code: "unavailable" });
          assert.equal(await getActiveAuthorSessionByTokenHash(hashAuthorSessionToken(a.token!)), null);
        }
      }
      const a = await login("blocked");
      await client`update authors set blocked_at=now() where id=${a.authorId}`;
      await assert.rejects(login("blocked"), { code: "unavailable" });
      await client`update authors set blocked_at=null,is_system=true where id=${a.authorId}`;
      await assert.rejects(login("blocked"), { code: "unavailable" });
    });
    await t.test("credential revocation serializes after unlink, admin may revoke deliberately", async () => {
      const { revokeAuthorAccessToken } = await import("../src/db/queries/author-access-tokens");
      const a = await login("token-lock");
      const [token] = await client`insert into author_access_tokens(author_id,token_hash,label,created_by_admin_id) values(${a.authorId},'access-token-lock','test',1) returning id`;
      const results = await Promise.allSettled([
        unlinkExternalAuthIdentity({ authorId: a.authorId, sessionId: await sessionId(a.token), identityId: a.identityId, availableProviders: [] }),
        revokeAuthorAccessToken(token.id),
      ]);
      assert.equal(results[1].status, "fulfilled");
      assert.ok((await client`select revoked_at from author_access_tokens where id=${token.id}`)[0].revoked_at);
    });
    await t.test("parallel reset challenges acquire author first and consume all reset tokens once", { timeout: 10000 }, async () => {
      const { resetAuthorPassword } = await import("../src/db/operations/author-auth");
      const a = await login("reset-lock-order");
      await client`insert into author_accounts(author_id,login,normalized_login,password_hash,status) values(${a.authorId},'reset-lock','reset-lock','before','active')`;
      await client`insert into author_auth_challenges(author_id,purpose,token_hash,expires_at)
        values(${a.authorId},'reset_password','reset-first',now()+interval '1 hour'),(${a.authorId},'reset_password','reset-second',now()+interval '1 hour')`;
      let release!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const locked = new Promise<void>(resolve => { ready = resolve; });
      const holder = client.begin(async tx => {
        await tx`select id from authors where id=${a.authorId} for update`;
        ready();
        await gate;
      });
      await locked;
      const resets = Promise.all([
        resetAuthorPassword({ tokenHash: "reset-first", passwordHash: "first" }),
        resetAuthorPassword({ tokenHash: "reset-second", passwordHash: "second" }),
      ]);
      try {
        let waiters = 0;
        for (let attempt = 0; attempt < 40; attempt++) {
          const [row] = await admin`select count(*)::int as n from pg_stat_activity where application_name=${schema} and wait_event_type='Lock'`;
          waiters = row.n;
          if (waiters >= 2) break;
          await delay(25);
        }
        assert.ok(waiters >= 2, "both reset attempts must contend on the held author lock");
      } finally {
        release();
      }
      await holder;
      assert.deepEqual((await resets).sort(), [false, true]);
      assert.equal(await resetAuthorPassword({ tokenHash: "reset-first", passwordHash: "again" }), false);
      assert.equal(await resetAuthorPassword({ tokenHash: "reset-second", passwordHash: "again" }), false);
      assert.equal((await client`select * from author_auth_challenges where author_id=${a.authorId} and consumed_at is null`).length, 0);
      assert.equal(await getActiveAuthorSessionByTokenHash(hashAuthorSessionToken(a.token!)), null);
    });
    await t.test("email verification consults historical event after identities were removed; local registration still emits once", async () => {
      const { onboardExistingAuthor, verifyAuthorEmailChallenge } = await import("../src/db/operations/author-auth");
      const { encryptEmailProviderApiKey } = await import("../src/lib/auth/email-provider-crypto");
      await client`insert into email_delivery_settings(id,provider,enabled,encrypted_api_key,from_name,from_email) values(1,'resend',true,${encryptEmailProviderApiKey("re_external_auth_test_only_key")!},'Test','test@example.com')`;
      process.env.AUTHOR_REGISTRATION_SKIP_EMAIL_VERIFICATION = "false";
      const external = await login("onboard");
      const local = (await client`insert into authors(code,name,access_profile_id) values('local','Local',1) returning id`)[0];
      for (const authorId of [external.authorId, local.id]) {
        await onboardExistingAuthor({ authorId, login: `user${authorId}`, normalizedLogin: `user${authorId}`, passwordHash: "hash", email: `user${authorId}@example.com`, normalizedEmail: `user${authorId}@example.com` });
        await client`delete from author_auth_identities where author_id=${authorId}`;
        const [challenge] = await client`select token_hash from author_auth_challenges where author_id=${authorId}`;
        assert.ok(await verifyAuthorEmailChallenge(challenge.token_hash));
        assert.equal(await verifyAuthorEmailChallenge(challenge.token_hash), null);
        assert.equal(await eventCount(authorId), 1);
        await updateAuthorAccountStatus({ authorId, status: "active" });
      }
      // History lookup is indexed as event history grows. Tiny fixtures can prefer
      // a seq scan, so inspect index compatibility without timing a synthetic load.
      await client`set enable_seqscan=off`;
      const plan = await client.unsafe(`explain select id from domain_events where type='author.registration.submitted' and aggregate_type='author' and aggregate_id='${external.authorId}' limit 1`);
      assert.match(JSON.stringify(plan), /domain_events_author_registration_idx/);
      await client`set enable_seqscan=on`;
    });
    await t.test("provider migration preserves legacy content and separates auth credentials and revisions", async () => {
      process.env.COVER_PROVIDER_CREDENTIALS_KEY = "isolated-test-provider-key-at-least-32-characters";
      const { encryptProviderCredentials, decryptProviderCredentials } = await import("../src/lib/providers/credential-crypto");
      const legacy = encryptProviderCredentials({ apiKey: "legacy-content-secret" });
      assert.ok(legacy);
      await client.unsafe(`create table admin_users(id serial primary key);
        insert into admin_users(id) values(1);
        create table provider_credentials(provider_code text constraint provider_credentials_pk primary key,
          encrypted_payload text not null,key_hint text not null,updated_by_admin_id int references admin_users(id),
          created_at timestamptz default now() not null,updated_at timestamptz default now() not null)`);
      await client`insert into provider_credentials(provider_code,encrypted_payload,key_hint) values('yandex',${legacy},'legacy')`;
      await client.unsafe(await readFile(new URL("../drizzle-archive/pre-baseline/0158_auth_provider_settings.sql", import.meta.url), "utf8"));
      const [migrated] = await client`select * from provider_credentials where provider_code='yandex'`;
      assert.equal(migrated.purpose, "content");
      assert.equal(migrated.encrypted_payload, legacy);
      assert.deepEqual(decryptProviderCredentials(migrated.encrypted_payload), { apiKey: "legacy-content-secret" });
      assert.equal(decryptProviderCredentials(legacy, { purpose: "auth", providerCode: "yandex" }), null);
      const { getAuthProviderConfiguration, saveAuthProviderSettings } = await import("../src/db/queries/auth-provider-settings");
      assert.deepEqual(await getAuthProviderConfiguration("yandex"), { enabled: false, credentials: null, revision: "unconfigured" });
      const save = (clientId: string, clientSecret: string, enabled = true) => saveAuthProviderSettings({ providerCode: "yandex", adminId: 1, clientId, clientSecret, enabled });
      assert.equal((await save("", "", false)).error, null);
      assert.equal((await getAuthProviderConfiguration("yandex")).enabled, false);
      assert.ok((await save("client", "")).error);
      assert.equal((await save("client", "secret")).error, null);
      const initial = await getAuthProviderConfiguration("yandex");
      assert.equal((await save("client", "   ")).error, null);
      const current = await getAuthProviderConfiguration("yandex");
      assert.deepEqual(current.credentials, { clientId: "client", clientSecret: "secret" });
      assert.notEqual(current.revision, initial.revision);
      const [auth] = await client`select * from provider_credentials where purpose='auth' and provider_code='yandex'`;
      assert.equal(decryptProviderCredentials(auth.encrypted_payload), null);
      assert.equal(decryptProviderCredentials(auth.encrypted_payload, { purpose: "auth", providerCode: "other" }), null);
      const [content] = await client`select * from provider_credentials where purpose='content' and provider_code='yandex'`;
      assert.equal(content.encrypted_payload, legacy);
      await client.unsafe(`create table provider_settings(media_type text,provider_code text,enabled boolean default true,
        title_search_mode text default 'parallel',cover_search_enabled boolean default true,priority int default 100,
        created_at timestamptz default now(),updated_at timestamptz default now(),primary key(media_type,provider_code))`);
      await client`insert into provider_credentials(purpose,provider_code,encrypted_payload,key_hint) values('content','rawg',${legacy},'legacy')`;
      const { getCoverProviderCredentialsForSearch, updateCoverProviderCredentials } = await import("../src/db/queries/cover-settings");
      assert.deepEqual((await getCoverProviderCredentialsForSearch()).rawg, { apiKey: "legacy-content-secret" });
      assert.equal((await updateCoverProviderCredentials({ adminId: 1, providerCode: "rawg", values: { apiKey: "replacement" } })).ok, true);
      assert.deepEqual((await getCoverProviderCredentialsForSearch()).rawg, { apiKey: "replacement" });
      assert.deepEqual((await getAuthProviderConfiguration("yandex")).credentials, current.credentials);
      // Admin writes wait for the same shared configuration lock held during login.
      let releaseConfiguration!: () => void;
      let configurationLocked!: () => void;
      const configurationGate = new Promise<void>(resolve => { releaseConfiguration = resolve; });
      const configurationReady = new Promise<void>(resolve => { configurationLocked = resolve; });
      const configurationHolder = client.begin(async tx => {
        await tx`select provider_code from auth_provider_settings where provider_code='yandex' for share`;
        configurationLocked();
        await configurationGate;
      });
      await configurationReady;
      let saveSettled = false;
      const waitingSave = save("client", "").then(result => { saveSettled = true; return result; });
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const [row] = await admin`select count(*)::int as n from pg_stat_activity where application_name=${schema} and wait_event_type='Lock'`;
          if (row.n >= 1) { waiting = true; break; }
          await delay(25);
        }
        assert.ok(waiting, "admin save must wait for the login configuration lock");
        assert.equal(saveSettled, false);
      } finally {
        releaseConfiguration();
        await configurationHolder;
      }
      assert.equal((await waitingSave).error, null);
      const afterLock = await getAuthProviderConfiguration("yandex");
      const identity = { intent: "login" as const, provider: "yandex", subject: "settings-identity", configurationRevision: afterLock.revision };
      await assert.rejects(completeExternalAuth({ ...identity, configurationRevision: initial.revision }), { code: "unavailable" });
      await completeExternalAuth(identity);
      assert.ok((await save("changed-client", "new-secret")).error);
      assert.deepEqual((await getAuthProviderConfiguration("yandex")).credentials, current.credentials);
      assert.equal((await save("client", "", false)).error, null);
      const disabled = await getAuthProviderConfiguration("yandex");
      await assert.rejects(completeExternalAuth({ ...identity, configurationRevision: disabled.revision }), { code: "unavailable" });
      const storedCiphertext = (await client`select encrypted_payload from provider_credentials where purpose='auth' and provider_code='yandex'`)[0].encrypted_payload;
      const masterKey = process.env.COVER_PROVIDER_CREDENTIALS_KEY;
      try {
        delete process.env.COVER_PROVIDER_CREDENTIALS_KEY;
        assert.ok((await save("client", "secret", true)).error);
        assert.equal((await save("client", "", false)).error, null);
        const [withoutKey] = await client`select encrypted_payload from provider_credentials where purpose='auth' and provider_code='yandex'`;
        assert.equal(withoutKey.encrypted_payload, storedCiphertext);
      } finally {
        process.env.COVER_PROVIDER_CREDENTIALS_KEY = masterKey;
      }
      await client`update provider_credentials set encrypted_payload='corrupted' where purpose='auth' and provider_code='yandex'`;
      assert.ok((await save("client", "replacement", true)).error);
      assert.equal((await save("client", "replacement", false)).error, null);
      const [corrupted] = await client`select encrypted_payload from provider_credentials where purpose='auth' and provider_code='yandex'`;
      assert.equal(corrupted.encrypted_payload, "corrupted");
      assert.equal((await getAuthProviderConfiguration("yandex")).enabled, false);

    });
  } finally {
    await client.end({ timeout: 1 });
    await admin.unsafe(`drop schema ${schema} cascade`);
    assert.equal((await admin`select 1 from pg_namespace where nspname=${schema}`).length, 0);
    await admin.end({ timeout: 1 });
  }
});
