import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

const testUrl = process.env.ANIME_COMPANY_LOGO_TEST_DATABASE_URL;
test("logo moderation plans remain bounded for details and measure full queues at scale", { skip: !testUrl, timeout: 180_000 }, async t => {
  const schema = `logo_plan_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const client = postgres(url.toString(), { max: 1, onnotice: () => undefined });
  const { db, dbClient } = await import("../src/db");
  const s = await import("../src/db/schema");
  const queries = await import("../src/db/queries/creator-requests");
  const logos = await import("../src/db/queries/anime-company-logo-binding");
  const output = `/tmp/creator-logo-plans-${process.pid}.jsonl`;
  writeFileSync(output, "");
  type Query = { sql: string; params: unknown[] };
  const measure = async (name: string, query: Query, bounded = false) => {
    const [row] = await client.unsafe(`explain(analyze,buffers,format json) ${query.sql}`, query.params as never[]);
    const result = row["QUERY PLAN"][0];
    appendFileSync(output, JSON.stringify({ name, ...query, result }) + "\n");
    const buffers = result.Plan["Shared Hit Blocks"] + result.Plan["Shared Read Blocks"];
    t.diagnostic(JSON.stringify({ name, ms: result["Execution Time"], rows: result.Plan["Actual Rows"], buffers }));
    if (bounded) assert.ok(buffers < 500, `${name} accessed ${buffers} buffers for a point lookup`);
    return result;
  };
  try {
    await client.unsafe(`create schema ${schema}`);
    for (const table of ["creator_types", "creator_roles", "creators", "creator_requests", "creator_request_media_items", "creator_logo_candidates", "job_runs", "provider_creator_exclusions", "provider_creator_bindings"]) {
      await client.unsafe(`create unlogged table ${schema}.${table} (like public.${table} including all)`);
    }
    await client.unsafe(`
      insert into creator_types select * from public.creator_types;
      insert into creator_roles select * from public.creator_roles;
      insert into creators(id,name,slug,type_id) select g,'Studio '||g,'studio-'||g,(select id from creator_types where code='organization') from generate_series(1,100000)g;
      insert into creator_requests(id,provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name,decision)
        select g,'tmdb','anime','company:'||g,'Company '||g,'company '||g,case when g%20=0 then 'exclude' else null end from generate_series(1,100000)g;
      insert into creator_logo_candidates(request_id,creator_id,anilist_studio_id,decision,resolved_at)
        select g,((g+p-1)%100000)+1,'studio:'||(((g+p-1)%100000)+1),case when g%5=1 or (g=99999 and p=0) then null else 'reject' end,
        case when g%5=1 or (g=99999 and p=0) then null else now() end
        from generate_series(1,100000)g cross join generate_series(0,1)p;
      insert into creator_request_media_items(request_id,media_item_id,role_id,external_creator_name)
        select g,m,(select id from creator_roles where code='production_company'),'Company '||g from generate_series(1,10000)g cross join generate_series(1,30)m;
      insert into provider_creator_exclusions(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name)
        select 'tmdb','anime','company:'||g,'Company '||g,'company '||g from generate_series(20,100000,20)g;
      insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id)
        select 'anilist','studio:'||g,'Studio '||g,g from generate_series(1,100000)g;
      analyze creator_types; analyze creator_roles; analyze creators; analyze creator_requests;
      analyze creator_request_media_items; analyze creator_logo_candidates; analyze job_runs; analyze provider_creator_exclusions; analyze provider_creator_bindings;
    `);
    await measure("before-count", { sql: "select count(*)::int from creator_requests where decision is null", params: [] });
    await measure("after-count", queries.getPendingCreatorRequestCountQuery().toSQL());
    const baseline = { sql: `select q.id,q.provider,q.external_creator_id,
      coalesce((select jsonb_agg(distinct r.name) from creator_request_media_items o join creator_roles r on r.id=o.role_id where o.request_id=q.id),'[]'::jsonb) roles,
      q.media_type,q.external_creator_name,q.normalized_external_creator_name,q.decision,
      case when j.status in ('queued','running') then 'applying' when j.status in ('failed','cancelled') then 'failed' when j.status='succeeded' then case when q.decision is null then 'pending' else 'processed' end else q.apply_status end status,
      q.job_run_id,coalesce(j.error_message,q.job_error),q.first_seen_at,
      (select count(distinct o.media_item_id)::int from creator_request_media_items o where o.request_id=q.id) occurrence_count
      from creator_requests q left join job_runs j on j.id=q.job_run_id where q.decision is null order by q.first_seen_at,q.id`, params: [] };
    await measure("before-list", baseline);
    assert.equal((await measure("after-list", queries.getCreatorRequestsQuery().toSQL())).Plan["Actual Rows"], 32001);
    await measure("before-pagination-full-list-all", { ...baseline, sql: baseline.sql.replace("where q.decision is null order by", "order by") });
    const checkPagination = async (distribution: "common" | "rare" | "absent") => {
      const expectedPending = Array.from({ length: 100000 }, (_, i) => i + 1).filter(id =>
        id % 20 === 0 ? id > 10000 : id <= 10000 || (distribution === "common" ? id % 5 === 1 || id === 99999 : distribution === "rare" && id === 99999));
      for (const all of [false, true]) {
        const mode = all ? "all" : "pending";
        const expected = all ? Array.from({ length: 100000 }, (_, i) => i + 1) : expectedPending;
        const totalPages = Math.ceil(expected.length / 30);
        const [count] = await queries.getCreatorRequestsCountQuery({ all });
        assert.equal(count.count, expected.length, `${distribution}/${mode} count retains legacy and pair decisions`);
        await measure(`page-count-${distribution}-${mode}`, queries.getCreatorRequestsCountQuery({ all }).toSQL());
        for (const page of [1, Math.ceil(totalPages / 2), totalPages]) {
          const name = `page-${distribution}-${mode}-${page}`;
          const idsQuery = queries.getCreatorRequestsPageIdsQuery({ all, page, pageSize: 30 });
          await measure(`${name}-ids`, idsQuery.toSQL());
          const ids = (await idsQuery).map(row => row.id);
          assert.deepEqual(ids, expected.slice((page - 1) * 30, page * 30), "equal timestamps must be ordered deterministically by ID");
          const hydrated = queries.getCreatorRequestsQuery({ all: true, requestIds: ids });
          const plan = await measure(`${name}-hydrate`, hydrated.toSQL());
          assert.equal(plan.Plan["Actual Rows"], ids.length);
          const inspect = (node: Record<string, unknown>) => {
            if (["creator_logo_candidates", "creator_request_media_items"].includes(String(node["Relation Name"]))) {
              assert.notEqual(node["Node Type"], "Seq Scan", `${name} must constrain aggregate inputs to the page IDs`);
              assert.ok(Number(node["Actual Rows"]) * Number(node["Actual Loops"]) <= 900, `${name} reads more occurrences than 30 rows × fan-out 30`);
            }
            for (const child of (node.Plans ?? []) as Record<string, unknown>[]) inspect(child);
          };
          inspect(plan.Plan);
          const result = await queries.getCreatorRequestsPage({ all, page });
          assert.equal(result.page, page); assert.equal(result.pageSize, 30);
          assert.equal(result.totalCount, expected.length); assert.equal(result.totalPages, totalPages);
          assert.deepEqual(result.items.map(row => row.id), ids);
          assert.ok(result.items.length <= 30);
        }
        const first = await queries.getCreatorRequestsPageIdsQuery({ all, page: 1, pageSize: 30 });
        const second = await queries.getCreatorRequestsPageIdsQuery({ all, page: 2, pageSize: 30 });
        assert.equal(new Set([...first, ...second].map(row => row.id)).size, 60, "adjacent pages do not overlap");
      }
      if (distribution === "common") {
        for (const page of [NaN, -2, 0, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
          assert.equal((await queries.getCreatorRequestsPage({ all: true, page })).page, 1);
        }
        const last = await queries.getCreatorRequestsPage({ all: true, page: Number.MAX_SAFE_INTEGER });
        assert.equal(last.page, last.totalPages); assert.deepEqual(last.items.map(row => row.id), [99991, 99992, 99993, 99994, 99995, 99996, 99997, 99998, 99999, 100000]);
      }
    };
    await checkPagination("common");
    for (const [name, requestId] of [["common", 10001], ["rare", 99999], ["rejected", 99998], ["legacy", 100000], ["absent", 100001]] as const) {
      await measure(`detail-${name}`, queries.getCreatorRequestsQuery({ requestId }).toSQL(), true);
      await measure(`candidates-${name}`, logos.getAnimeCompanyLogoCandidates(requestId).toSQL(), true);
    }
    await measure("creator-owner", logos.animeCompanyLogoCreatorQuery(99999).toSQL(), true);
    await measure("creator-bindings", logos.animeCompanyLogoBindingsQuery(99999).toSQL(), true);
    await measure("validate-pair", db.select().from(s.creatorLogoCandidates).where(and(eq(s.creatorLogoCandidates.requestId, 99999), eq(s.creatorLogoCandidates.creatorId, 99999))).toSQL(), true);
    await measure("register-request-identities", db.select().from(s.creatorRequests).where(and(eq(s.creatorRequests.provider, "tmdb"), inArray(s.creatorRequests.externalCreatorId, ["company:99999", "company:99998"]))).orderBy(asc(s.creatorRequests.id)).toSQL(), true);
    await measure("register-request-lock", db.select({ id: s.creatorRequests.id }).from(s.creatorRequests).where(inArray(s.creatorRequests.id, [99999, 99998])).orderBy(asc(s.creatorRequests.id)).for("update").toSQL(), true);
    await measure("register-existing-pairs", db.select({ requestId: s.creatorLogoCandidates.requestId, decision: s.creatorLogoCandidates.decision }).from(s.creatorLogoCandidates).where(and(eq(s.creatorLogoCandidates.creatorId, 99999), inArray(s.creatorLogoCandidates.requestId, [99999, 99998]))).toSQL(), true);
    await measure("source-request-guard", db.select({ id: s.creatorRequests.id }).from(s.creatorRequests).where(and(eq(s.creatorRequests.provider, "anilist"), eq(s.creatorRequests.externalCreatorId, "studio:99999"), sql`(${s.creatorRequests.decision}='exclude' or (${s.creatorRequests.manuallyReopened} and ${s.creatorRequests.decision} is null))`)).limit(1).toSQL(), true);
    await measure("source-exclusion-guard", db.select({ id: s.providerCreatorExclusions.id }).from(s.providerCreatorExclusions).where(and(eq(s.providerCreatorExclusions.provider, "anilist"), sql`(${s.providerCreatorExclusions.externalCreatorId}=${"studio:99999"} or (${s.providerCreatorExclusions.externalCreatorId} is null and ${s.providerCreatorExclusions.mediaType}='anime' and ${inArray(s.providerCreatorExclusions.normalizedExternalCreatorName, ["studio 99999", "studio 99999"])}))`)).limit(1).toSQL(), true);
    for (const distribution of ["rare", "absent"] as const) {
      await client`update creator_logo_candidates set decision='reject',resolved_at=now()`;
      if (distribution === "rare") await client`update creator_logo_candidates set decision=null,resolved_at=null where request_id=99999 and creator_id=99999`;
      await client`analyze creator_logo_candidates`;
      await measure(`before-count-${distribution}`, { sql: "select count(*)::int from creator_requests where decision is null", params: [] });
      await measure(`after-count-${distribution}`, queries.getPendingCreatorRequestCountQuery().toSQL());
      await measure(`before-list-${distribution}`, baseline);
      assert.equal((await measure(`after-list-${distribution}`, queries.getCreatorRequestsQuery().toSQL())).Plan["Actual Rows"], distribution === "rare" ? 14001 : 14000);
      await checkPagination(distribution);
    }
    const explainWrite = async (name: string, query: Query) => {
      const [row] = await client.unsafe(`explain(format json) ${query.sql}`, query.params as never[]);
      appendFileSync(output, JSON.stringify({ name, mutationExecuted: false, ...query, result: row["QUERY PLAN"][0] }) + "\n");
    };
    await explainWrite("register-insert-pair", db.insert(s.creatorLogoCandidates).values({ requestId: 99999, creatorId: 99999, anilistStudioId: "studio:99999" }).onConflictDoNothing().toSQL());
    await explainWrite("reject-update-pair", db.update(s.creatorLogoCandidates).set({ decision: "reject", resolvedByAdminId: null, resolvedAt: new Date(), updatedAt: new Date() }).where(and(eq(s.creatorLogoCandidates.requestId, 99999), eq(s.creatorLogoCandidates.creatorId, 99999))).toSQL());
    await explainWrite("repair-pending-pairs", db.update(s.creatorLogoCandidates).set({ decision: "reject", resolvedByAdminId: 1, resolvedAt: new Date(), updatedAt: new Date() }).where(and(eq(s.creatorLogoCandidates.requestId, 100000), isNull(s.creatorLogoCandidates.decision))).toSQL());
    await explainWrite("repair-delete-exclusion", db.delete(s.providerCreatorExclusions).where(and(eq(s.providerCreatorExclusions.provider, "tmdb"), eq(s.providerCreatorExclusions.externalCreatorId, "company:100000"), eq(s.providerCreatorExclusions.mediaType, "anime"))).toSQL());
    await explainWrite("repair-reset-request", db.update(s.creatorRequests).set({ decision: null, resolvedByAdminId: null, resolvedAt: null, jobRunId: null, applyStatus: "pending", jobError: null, manuallyReopened: false, updatedAt: new Date() }).where(eq(s.creatorRequests.id, 100000)).toSQL());
    const migration = readFileSync("drizzle/0147_creator_logo_candidates.sql", "utf8").split("--> statement-breakpoint");
    const backfill = migration.find(statement => /INSERT INTO creator_logo_candidates/.test(statement))!;
    await client.unsafe(`create unlogged table game_company_profiles (like public.game_company_profiles including all)`);
    await client.unsafe(`insert into game_company_profiles(provider,external_id,name,details) select 'tmdb','company:'||g,'Company '||g,jsonb_build_object('anilistStudioId','studio:'||g,'suggestedCreatorIds',jsonb_build_array(g,((g%100000)+1))) from generate_series(1,100000)g; analyze game_company_profiles`);
    await client`delete from creator_logo_candidates where creator_id=request_id`;
    await client`analyze creator_logo_candidates`;
    await explainWrite("migration-backfill", { sql: backfill, params: [] });
    // Executing this mutation is safe: all tables and rows belong to this disposable schema.
    await measure("migration-backfill-isolated-half-existing", { sql: backfill, params: [] });
    await explainWrite("migration-cleanup", { sql: migration.find(statement => /DELETE FROM creator_requests/.test(statement))!, params: [] });
    t.diagnostic(`Fixtures: 100000 requests, 100000 creators, 200000 pairs, 300000 occurrences, 5000 exclusions, 100000 bindings. Plans: ${output}`);
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await Promise.all([client.end(), dbClient.end()]);
  }
});
