import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { snapshotHash } from "../src/lib/providers/snapshot-values";

const testUrl = process.env.ANIME_COMPANY_LOGO_TEST_DATABASE_URL;
test("anime company discovery uses real cache, requests and evidence resolver without anime participation", { skip: !testUrl }, async t => {
  const schema = `anime_logo_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const admin = postgres(testUrl!, { max: 1, onnotice: () => undefined });
  const { dbClient } = await import("../src/db");
  const { ensureAnimeCompanyLogoBinding } = await import("../src/lib/creators/anime-company-logo-binding");
  const { saveProviderSnapshot } = await import("../src/db/queries/provider-snapshots");
  const { creatorProfileDescriptor } = await import("../src/lib/providers/creator-profile-targets");
  try {
    await admin.unsafe(`create schema ${schema}; set search_path=${schema},public`);
    const tables = await admin<{ tablename: string }[]>`select tablename from pg_tables where schemaname='public'`;
    for (const { tablename } of tables) await admin.unsafe(`create unlogged table ${schema}."${tablename.replaceAll('"', '""')}" (like public."${tablename.replaceAll('"', '""')}" including all)`);
    await admin`insert into creator_types select * from public.creator_types`;
    await admin`insert into creator_roles select * from public.creator_roles`;
    const [type] = await admin`select id from creator_types where code='organization'`;
    const setup = async (id: number, name: string) => {
      await admin`insert into creators(id,name,original_name,name_ru,name_ru_source,slug,type_id) values(${id},${name},${name},'Локализованное название','ai',${`studio-${id}`},${type.id})`;
      await admin`insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id) values('anilist',${`studio:${id}`},${name},${id})`;
    };
    let searches = 0, profiles = 0;
    let results: { id: number; name: string; logo_path: string | null; origin_country: string }[] = [];
    const deps = {
      settings: async () => [{ providerCode: "tmdb", mediaType: "film", enabled: true, titleSearchMode: "title", coverSearchEnabled: true, priority: 1 }, { providerCode: "tmdb", mediaType: "anime", enabled: false, titleSearchMode: "title", coverSearchEnabled: false, priority: 1 }] as never,
      credentials: async () => ({ tmdb: { accessToken: "test" } }),
      search: async (query: string) => { searches++; return { complete: true as const, query, results, responses: [] }; },
      profile: async (target: Parameters<typeof creatorProfileDescriptor>[0]) => {
        profiles++;
        const payload = { id: Number(target.externalId), name: results.find(row => String(row.id) === target.externalId)!.name, logo_path: "/logo.png" };
        return saveProviderSnapshot({ ...creatorProfileDescriptor(target), payload, payloadHash: snapshotHash(payload), contentType: "application/json", requestStartedAt: new Date(), fetchedAt: new Date() });
      },
    };
    const options = () => ({ signal: new AbortController().signal, beforeRequest: async () => {} });
    const candidate = (id: number, name: string) => ({ id, name, logo_path: "/logo.png", origin_country: "JP" });
    await t.test("exact singleton auto maps existing organization with film enabled and anime off", async () => {
      await setup(1, "Studio One"); results = [candidate(101, "STUDIO ONE")];
      assert.equal((await ensureAnimeCompanyLogoBinding(1, options(), deps)).status, "ready");
      assert.equal(searches, 1); assert.equal(profiles, 1);
      const [binding] = await admin`select creator_id from provider_creator_bindings where provider='tmdb' and external_creator_id='company:101' and active`;
      assert.equal(binding.creator_id, 1);
      assert.equal((await admin`select count(*)::int n from creators`)[0].n, 1);
      assert.equal((await admin`select count(*)::int n from creator_request_media_items`)[0].n, 0);
      assert.equal((await admin`select count(*)::int n from entry_creator_sources`)[0].n, 0);
      assert.equal((await ensureAnimeCompanyLogoBinding(1, { ...options(), refresh: true }, deps)).status, "ready");
      assert.equal(searches, 1, "confirmed binding bypasses discovery even with refresh");
    });
    await t.test("cached empty and ambiguous evidence is offline; manual refresh retries", async () => {
      await setup(2, "Missing Studio"); results = [];
      assert.equal((await ensureAnimeCompanyLogoBinding(2, options(), deps)).status, "missing");
      const before = searches;
      assert.equal((await ensureAnimeCompanyLogoBinding(2, options(), deps)).status, "missing"); assert.equal(searches, before);
      await ensureAnimeCompanyLogoBinding(2, { ...options(), refresh: true }, deps); assert.equal(searches, before + 1);
      await setup(3, "Ambiguous Studio"); results = [candidate(301, "Ambiguous Studio"), candidate(302, "AMBIGUOUS STUDIO")];
      assert.equal((await ensureAnimeCompanyLogoBinding(3, options(), deps)).status, "pending");
      const cached = searches;
      assert.equal((await ensureAnimeCompanyLogoBinding(3, options(), deps)).status, "pending"); assert.equal(searches, cached);
      const requests = await admin`select external_creator_id,decision from creator_requests where external_creator_id in ('company:301','company:302')`;
      assert.equal(requests.length, 2); assert.ok(requests.every(row => row.decision === null));
      const [profile] = await admin`select details from game_company_profiles where provider='tmdb' and external_id='company:301'`;
      assert.deepEqual(profile.details.suggestedCreatorIds, [3]);
    });
    await t.test("source exclusions, reopened source and historical target identities prevent automatic binding", async () => {
      await setup(4, "Excluded Studio"); results = [candidate(401, "Excluded Studio")];
      await admin`insert into provider_creator_exclusions(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name) values('anilist','anime','studio:4','Excluded Studio','excluded studio')`;
      const before = searches;
      assert.equal((await ensureAnimeCompanyLogoBinding(4, options(), deps)).status, "unsupported"); assert.equal(searches, before);
      await setup(5, "Reopened Studio");
      await admin`insert into creator_requests(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name,manually_reopened) values('anilist','anime','studio:5','Reopened Studio','reopened studio',true)`;
      assert.equal((await ensureAnimeCompanyLogoBinding(5, options(), deps)).status, "unsupported"); assert.equal(searches, before);
      await setup(6, "Historical Studio");
      await admin`insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id,active) values('tmdb','company:601','Historical Studio',6,false)`;
      assert.equal((await ensureAnimeCompanyLogoBinding(6, options(), deps)).status, "pending"); assert.equal(searches, before);
      await setup(7, "Excluded Target"); results = [candidate(701, "Excluded Target")];
      await admin`insert into provider_creator_exclusions(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name) values('tmdb','anime','company:701','Excluded Target','excluded target')`;
      assert.equal((await ensureAnimeCompanyLogoBinding(7, options(), deps)).status, "pending");
      assert.equal((await admin`select count(*)::int n from provider_creator_bindings where provider='tmdb' and external_creator_id='company:701'`)[0].n, 0);
    });
    await t.test("tampered raw payload and source changes are fenced before auto mapping", async () => {
      await setup(8, "Tampered Studio"); results = [candidate(801, "Tampered Studio")];
      const tampered = { ...deps, profile: async (target: Parameters<typeof creatorProfileDescriptor>[0]) => {
        const profile = await deps.profile(target);
        await admin`update provider_snapshots set payload=payload || '{"name":"Tampered"}'::jsonb where id=${profile.id}`;
        return profile;
      } };
      assert.equal((await ensureAnimeCompanyLogoBinding(8, options(), tampered)).status, "pending");
      assert.equal((await admin`select count(*)::int n from provider_creator_bindings where provider='tmdb' and external_creator_id='company:801'`)[0].n, 0);
      await setup(9, "Changed Studio"); results = [candidate(901, "Changed Studio")];
      const { resolveCreatorRequest } = await import("../src/db/queries/creator-requests");
      const changed = { ...deps, resolve: async (input: Parameters<typeof resolveCreatorRequest>[0]) => {
        await admin`update provider_creator_bindings set active=false where provider='anilist' and external_creator_id='studio:9'`;
        return resolveCreatorRequest(input);
      } };
      assert.equal((await ensureAnimeCompanyLogoBinding(9, options(), changed)).status, "pending");
      assert.equal((await admin`select count(*)::int n from provider_creator_bindings where provider='tmdb' and external_creator_id='company:901'`)[0].n, 0);
    });
    await t.test("rejecting a logo match preserves other candidates and future real film participation", async () => {
      const { db } = await import("../src/db");
      const { mediaItems } = await import("../src/db/schema");
      const { eq } = await import("drizzle-orm");
      const requests = await import("../src/db/queries/creator-requests");
      const { syncTmdbCompanyCreators } = await import("../src/db/queries/tmdb-companies");
      await setup(10, "Unrelated Anime Studio"); results = [candidate(1001, "Real Film Company")];
      assert.equal((await ensureAnimeCompanyLogoBinding(10, options(), deps)).status, "pending");
      const [request] = await admin`select id from creator_requests where provider='tmdb' and external_creator_id='company:1001'`;
      await requests.rejectAnimeCompanyLogoCandidate({ requestId: request.id, creatorId: 10 });
      assert.equal((await admin`select decision from creator_requests where id=${request.id}`)[0].decision, null);
      assert.equal((await admin`select count(*)::int n from provider_creator_exclusions where external_creator_id='company:1001'`)[0].n, 0);
      assert.equal((await admin`select count(*)::int n from provider_creator_bindings where provider='tmdb' and external_creator_id='company:1001'`)[0].n, 0);
      assert.equal((await requests.getCreatorRequests({ requestId: request.id })).length, 0);
      const before = searches;
      await ensureAnimeCompanyLogoBinding(10, options(), deps);
      assert.equal(searches, before, "cached discovery must stay offline after rejection");
      await ensureAnimeCompanyLogoBinding(10, { ...options(), refresh: true }, deps);
      assert.equal((await admin`select decision from creator_logo_candidates where request_id=${request.id} and creator_id=10`)[0].decision, "reject");
      await setup(11, "Another Anime Studio");
      assert.equal((await ensureAnimeCompanyLogoBinding(11, options(), deps)).status, "pending");
      assert.equal((await admin`select decision from creator_logo_candidates where request_id=${request.id} and creator_id=11`)[0].decision, null);
      assert.equal((await requests.getCreatorRequests({ requestId: request.id })).length, 1);
      await requests.rejectAnimeCompanyLogoCandidate({ requestId: request.id, creatorId: 11 });
      assert.equal((await requests.getCreatorRequests({ requestId: request.id })).length, 0);

      const [film] = await admin`insert into media_items(code,title,media_type) values('real-film-company','Real film','film') returning id`;
      const references = [{ externalId: "company:1001", name: "Real Film Company", roleCode: "production_company" as const, sourcePosition: 0, logoPath: null, sourceUrl: "https://www.themoviedb.org/company/1001" }];
      const sync = () => db.transaction(async tx => {
        await tx.select({ id: mediaItems.id }).from(mediaItems).where(eq(mediaItems.id, film.id)).for("update");
        return syncTmdbCompanyCreators(tx, film.id, references);
      });
      await sync();
      assert.equal((await requests.getCreatorRequests({ requestId: request.id }))[0].occurrenceCount, 1, "real participation restores the ordinary moderation request");
      await setup(12, "Real Film Company");
      await requests.resolveCreatorRequest({ requestId: request.id, decision: "map", creatorId: 12 });
      await sync();
      assert.equal((await admin`select creator_id from entry_creators where entry_id=${film.id}`)[0].creator_id, 12);
      assert.equal((await admin`select creator_id from entry_creator_sources where entry_id=${film.id} and provider='tmdb'`)[0].creator_id, 12);
      assert.equal((await admin`select count(*)::int n from provider_creator_exclusions where external_creator_id='company:1001'`)[0].n, 0);
      assert.ok((await admin`select decision from creator_logo_candidates where request_id=${request.id}`).every(row => row.decision === "reject"));

      await setup(13, "Unrelated Source"); results = [candidate(1301, "Deliberately Ignored Company")];
      await ensureAnimeCompanyLogoBinding(13, options(), deps);
      references[0] = { ...references[0], externalId: "company:1301", name: "Deliberately Ignored Company", sourceUrl: "https://www.themoviedb.org/company/1301" };
      await sync();
      const [ignored] = await admin`select id from creator_requests where provider='tmdb' and external_creator_id='company:1301'`;
      await requests.resolveCreatorRequest({ requestId: ignored.id, decision: "exclude" });
      await sync();
      assert.equal((await admin`select count(*)::int n from provider_creator_exclusions where external_creator_id='company:1301'`)[0].n, 1, "ordinary participation ignore remains global");
      assert.equal((await admin`select count(*)::int n from entry_creator_sources where entry_id=${film.id} and provider='tmdb'`)[0].n, 0);
    });
    await t.test("logo-only decisions require a pair and a reopened binding can be reviewed again", async () => {
      const requests = await import("../src/db/queries/creator-requests");
      await setup(14, "Manual Studio"); results = [candidate(1401, "Different Company Name")];
      await ensureAnimeCompanyLogoBinding(14, options(), deps);
      const [request] = await admin`select id from creator_requests where external_creator_id='company:1401'`;
      for (const decision of ["create", "exclude"] as const) await assert.rejects(requests.resolveCreatorRequest({ requestId: request.id, decision, name: "Must not be created" }), { code: "logo-only" });
      await admin`insert into creator_requests(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name,manually_reopened) values('anilist','anime','studio:14','Manual Studio','manual studio',true)`;
      await assert.rejects(requests.resolveCreatorRequest({ requestId: request.id, creatorId: 14, logoCandidateCreatorId: 14, decision: "map" }), { code: "logo-candidate" });
      await admin`delete from creator_requests where provider='anilist' and external_creator_id='studio:14'`;
      await requests.resolveCreatorRequest({ requestId: request.id, creatorId: 14, logoCandidateCreatorId: 14, decision: "map" });
      await admin`update job_runs set status='succeeded' where id=(select job_run_id from creator_requests where id=${request.id})`;
      const [binding] = await admin`select id from provider_creator_bindings where provider='tmdb' and external_creator_id='company:1401' and active`;
      await requests.reopenCreatorBinding({ bindingId: binding.id, adminId: 1 });
      assert.equal((await admin`select decision from creator_logo_candidates where request_id=${request.id} and creator_id=14`)[0].decision, null);
      await admin`update job_runs set status='succeeded' where id=(select job_run_id from creator_requests where id=${request.id})`;
      await requests.rejectAnimeCompanyLogoCandidate({ requestId: request.id, creatorId: 14, adminId: 1 });
      assert.equal((await admin`select decision from creator_logo_candidates where request_id=${request.id} and creator_id=14`)[0].decision, "reject");
      assert.equal((await admin`select count(*)::int n from provider_creator_exclusions where external_creator_id='company:1401'`)[0].n, 0);
    });
    await t.test("legacy migration preserves global ignores until explicit narrowly scoped repair", async () => {
      const requests = await import("../src/db/queries/creator-requests");
      await setup(15, "Legacy Source"); results = [candidate(1501, "Legacy Candidate")];
      await ensureAnimeCompanyLogoBinding(15, options(), deps);
      const [request] = await admin`select id from creator_requests where external_creator_id='company:1501'`;
      await admin`delete from creator_logo_candidates where request_id=${request.id}`;
      await admin`update creator_requests set decision='exclude',apply_status='processed',resolved_at=now() where id=${request.id}`;
      await admin`insert into provider_creator_exclusions(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name) values('tmdb','anime','company:1501','Legacy Candidate','legacy candidate')`;
      const migration = readFileSync("drizzle/0147_creator_logo_candidates.sql", "utf8").split("--> statement-breakpoint").find(statement => statement.includes("INSERT INTO creator_logo_candidates"))!;
      await admin.unsafe(migration);
      assert.equal((await admin`select decision from creator_logo_candidates where request_id=${request.id}`)[0].decision, null);
      assert.equal((await admin`select count(*)::int n from provider_creator_exclusions where external_creator_id='company:1501'`)[0].n, 1);
      assert.equal((await requests.getCreatorRequests({ requestId: request.id }))[0].legacyLogoIgnore, true);
      await requests.repairLegacyAnimeCompanyLogoIgnore({ requestId: request.id, adminId: 1 });
      assert.equal((await admin`select count(*)::int n from provider_creator_exclusions where external_creator_id='company:1501'`)[0].n, 0);
      assert.equal((await admin`select decision from creator_logo_candidates where request_id=${request.id}`)[0].decision, "reject");
      assert.equal((await admin`select decision from creator_requests where id=${request.id}`)[0].decision, null);
      assert.equal((await requests.getCreatorRequests({ requestId: request.id })).length, 0);
      assert.equal((await admin`select count(*)::int n from provider_creator_exclusions where external_creator_id='company:1301'`)[0].n, 1, "intentional ignore with real participation is preserved");
      const [intentional] = await admin`select id from creator_requests where external_creator_id='company:1301'`;
      await admin`update job_runs set status='succeeded' where id=(select job_run_id from creator_requests where id=${intentional.id})`;
      await assert.rejects(requests.repairLegacyAnimeCompanyLogoIgnore({ requestId: intentional.id, adminId: 1 }), { code: "logo-candidate" });
    });
    await t.test("logo searches do not create moderation requests for candidates without logos", async () => {
      await setup(20, "Logo Missing Exact");
      results = [{ ...candidate(2001, "Logo Missing Exact"), logo_path: null }, candidate(2002, "Unrelated With Logo")];
      assert.equal((await ensureAnimeCompanyLogoBinding(20, options(), deps)).status, "missing");
      assert.equal((await admin`select count(*)::int n from creator_requests where external_creator_id in ('company:2001','company:2002')`)[0].n, 0);
      await setup(21, "Ambiguous Logo Search");
      results = [{ ...candidate(2101, "Ambiguous Logo Search"), logo_path: null }, candidate(2102, "AMBIGUOUS LOGO SEARCH")];
      assert.equal((await ensureAnimeCompanyLogoBinding(21, options(), deps)).status, "pending");
      assert.equal((await admin`select count(*)::int n from creator_requests where external_creator_id='company:2101'`)[0].n, 0);
      assert.equal((await admin`select count(*)::int n from provider_creator_bindings where provider='tmdb' and external_creator_id='company:2102' and active`)[0].n, 0, "filtering missing logos must not turn ambiguous identity evidence into an automatic match");
    });
    await t.test("migration retires only untouched logo-less search envelopes", async () => {
      await setup(22, "Old Search Studio"); results = [candidate(2201, "Old Unrelated Result")];
      await ensureAnimeCompanyLogoBinding(22, options(), deps);
      await admin`update game_company_profiles set image_url=null,image_status='missing' where external_id in ('company:2201','company:1301')`;
      const cleanup = readFileSync("drizzle/0147_creator_logo_candidates.sql", "utf8").split("--> statement-breakpoint").find(statement => statement.includes("DELETE FROM creator_requests"))!;
      await admin.unsafe(cleanup);
      assert.equal((await admin`select count(*)::int n from creator_requests where external_creator_id='company:2201'`)[0].n, 0);
      assert.equal((await admin`select count(*)::int n from creator_requests where external_creator_id='company:1301'`)[0].n, 1, "real participation and its deliberate global ignore are kept");
      assert.equal((await admin`select count(*)::int n from provider_creator_exclusions where external_creator_id='company:1301'`)[0].n, 1);
    });
    await t.test("concurrent confirmation and rejection commit one pair decision without a global ignore", async () => {
      const requests = await import("../src/db/queries/creator-requests");
      await setup(23, "Concurrent Source"); results = [candidate(2301, "Possible Concurrent Company")];
      await ensureAnimeCompanyLogoBinding(23, options(), deps);
      const [request] = await admin`select id from creator_requests where external_creator_id='company:2301'`;
      const decisions = await Promise.allSettled([
        requests.resolveCreatorRequest({ requestId: request.id, creatorId: 23, logoCandidateCreatorId: 23, decision: "map" }),
        requests.rejectAnimeCompanyLogoCandidate({ requestId: request.id, creatorId: 23 }),
      ]);
      assert.equal(decisions.filter(result => result.status === "fulfilled").length, 1);
      const [pair] = await admin`select decision from creator_logo_candidates where request_id=${request.id} and creator_id=23`;
      const [global] = await admin`select decision from creator_requests where id=${request.id}`;
      assert.equal(global.decision, pair.decision === "map" ? "map" : null);
      assert.equal((await admin`select count(*)::int n from provider_creator_exclusions where external_creator_id='company:2301'`)[0].n, 0);
    });
  } finally {
    await admin.unsafe(`drop schema if exists ${schema} cascade`);
    await Promise.all([dbClient.end(), admin.end()]);
  }
});
