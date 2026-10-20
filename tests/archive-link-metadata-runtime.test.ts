import assert from "node:assert/strict";
import { test } from "node:test";

test("archive previews use public identities and indexed single lookups at scale", {
  skip: process.env.ARCHIVE_LINK_METADATA_TEST !== "1",
}, async t => {
  const { default: postgres } = await import("postgres");
  const originalUrl = process.env.DATABASE_URL!;
  const admin = postgres(originalUrl, { max: 1, prepare: false, onnotice() {} });
  const schema = `archive_meta_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(originalUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "1";
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  try {
    await client.unsafe(`
      create table creators(id integer primary key,name text,slug text unique,avatar_object_key text);
      create table franchises(id integer primary key,code text unique,title text,publication_status text);
      create table genres(id integer primary key,slug text unique,name text,is_active boolean);
      create table platforms(id integer primary key,slug text unique,name text,is_active boolean,logo_mode text,
        manual_logo_object_key text,imported_logo_object_key text,imported_logo_provider text,imported_logo_external_id text,imported_logo_image_key text);
      create table provider_platform_mappings(platform_id integer,provider text,external_platform_id text);
      create index platform_mappings_external_idx on provider_platform_mappings(provider,external_platform_id,platform_id);
      create table platform_requests(target_platform_id integer,kind text,decision text,apply_status text,proposal jsonb);
      create index platform_requests_target_idx on platform_requests(target_platform_id,kind);
      create index platform_requests_logo_evidence_idx on platform_requests(target_platform_id,(proposal->>'provider'),(proposal->>'externalId'),(proposal->>'imageKey'))
        where kind='logo' and decision='map' and apply_status='processed';
      insert into creators select i,'Creator '||i,'creator-'||i,null from generate_series(1,100000)i;
      update creators set avatar_object_key='avatars/creators/1/00000000-0000-4000-8000-000000000001.webp' where id=1;
      insert into franchises select i,'series-'||i,'Series '||i,'published' from generate_series(1,100000)i;
      insert into genres select i,'genre-'||i,'Genre '||i,true from generate_series(1,100000)i;
      insert into platforms select i,'platform-'||i,'Platform '||i,true,'auto',null,
        'avatars/platform-providers/igdb/'||i||'/'||repeat('a',64)||'.webp','igdb',i::text,'image-'||i from generate_series(1,100000)i;
      insert into provider_platform_mappings select i,p,i::text from generate_series(1,100000)i cross join (values('igdb'),('rawg'))p(p);
      insert into platform_requests select i,'logo','map',status,jsonb_build_object('provider','igdb','externalId',i::text,'imageKey','image-'||i,
        'objectKey','avatars/platform-providers/igdb/'||i||'/'||repeat('a',64)||'.webp') from generate_series(1,100000)i cross join(values('processed'),('pending'))s(status);
      update franchises set publication_status='private' where id=2;
      update genres set is_active=false where id=2;
      update platforms set is_active=false where id=2;
      analyze;
    `);
    const { getArchiveLinkMetadata } = await import("../src/lib/archive/link-metadata-loader");
    assert.deepEqual(await getArchiveLinkMetadata({}), {});
    for (const kind of ["series", "genre", "platform"] as const) assert.deepEqual(await getArchiveLinkMetadata({ [kind]: `${kind}-2` }), {});
    for (const kind of ["creator", "series", "genre", "platform"] as const) {
      for (const id of [1, 99999, 100001]) {
        const statements: { query: string; params: unknown[] }[] = [];
        client.options.debug = (_connection, query, params) => { if (query.startsWith("select")) statements.push({ query, params: [...params] }); };
        const result = await getArchiveLinkMetadata({ [kind]: `${kind}-${id}` });
        client.options.debug = false;
        assert.equal(statements.length, 1, "no roles, lists, counts, parent traversal or N+1 queries");
        if (id <= 100000) assert.ok(result.title); else assert.deepEqual(result, {});
        if (kind === "platform" && id <= 100000) assert.deepEqual(result.openGraph?.images, [`/platform-logos/providers/igdb/${id}/${"a".repeat(64)}.webp`]);
        if (kind === "creator") assert.deepEqual(result.openGraph?.images ?? [], id === 1 ? ["/creator-avatars/1/00000000-0000-4000-8000-000000000001.webp"] : []);
        const [{ query, params }] = statements;
        const [explained] = await client.unsafe(`explain(analyze,buffers,format json) ${query}`, params as never[]);
        const plan = explained["QUERY PLAN"][0];
        const nodes: { type: string; index?: string; rows: number; loops: number }[] = [];
        const visit = (node: Record<string, unknown>) => {
          nodes.push({ type: String(node["Node Type"]), index: node["Index Name"] as string | undefined, rows: Number(node["Actual Rows"]), loops: Number(node["Actual Loops"]) });
          for (const child of (node.Plans ?? []) as Record<string, unknown>[]) visit(child);
        };
        visit(plan.Plan);
        assert.ok(nodes.some(node => node.index?.includes(kind === "series" ? "franchises_code" : `${kind === "creator" ? "creators" : kind === "genre" ? "genres" : "platforms"}_slug`)));
        assert.ok(nodes.every(node => node.type !== "Seq Scan" && node.type !== "Sort" && node.loops <= 1));
        t.diagnostic(JSON.stringify({ kind, id, entitiesPerType: 100000, platformMappings: 200000, platformRequests: 200000, ms: plan["Execution Time"], nodes }));
      }
    }
  } finally {
    client.options.debug = false;
    await client.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    process.env.DATABASE_URL = originalUrl;
  }
});
