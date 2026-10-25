import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { and, eq, or, sql } from "drizzle-orm";

const testUrl = process.env.TMDB_COMPANIES_TEST_DATABASE_URL;
test("TMDB exact company candidate indexes match generated normalization at scale", { skip: !testUrl }, async t => {
  const schema = `tmdb_candidate_plan_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { db, getDbClient } = await import('../src/db');
  const { creators, creatorTypes, creatorRequestMediaItems } = await import('../src/db/schema');
  const { normalizeSearchSql } = await import('../src/db/search');
  const client = getDbClient();
  try {
    await client.unsafe(`create schema ${schema};
      create table creator_types(id integer primary key,code text);
      insert into creator_types values(1,'organization');
      create table creators(id integer primary key,name text,original_name text,type_id integer,name_ru text,name_ru_source text,name_ru_processed boolean default false);
      insert into creators select g,'Studio '||g,case when g=42 then 'Original Exact' else null end,1 from generate_series(1,10000)g;
      analyze creators;analyze creator_types;`);
    const query = db.select({ id: creators.id }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(and(eq(creatorTypes.code, 'organization'), or(sql`btrim(${normalizeSearchSql(creators.name)})=${'original exact'}`, sql`btrim(${normalizeSearchSql(creators.originalName)})=${'original exact'}`))).toSQL();
    const measure = async (phase: string) => {
      const [row] = await client.unsafe('explain(analyze,buffers,format json) ' + query.sql, query.params as never[]);
      const result = row['QUERY PLAN'][0];
      t.diagnostic(JSON.stringify({ phase, companies: 10000, executionMs: result['Execution Time'], sql: query.sql, plan: result.Plan }));
      return result;
    };
    await measure('before-exact-indexes');
    const statements = readFileSync('drizzle/0135_tmdb_company_creators.sql', 'utf8').split('--> statement-breakpoint').filter(statement => /CREATE INDEX creators_(name|original_name)_exact_idx/.test(statement));
    assert.equal(statements.length, 2);
    for (const statement of statements) await client.unsafe(statement);
    await client.unsafe('analyze creators');
    t.diagnostic(JSON.stringify(await client`select indexdef from pg_indexes where schemaname=${schema} and indexname like 'creators%exact_idx'`));
    const after = await measure('after-exact-indexes');
    assert.equal(after.Plan['Actual Rows'], 1);
    assert.match(JSON.stringify(after), /creators_(name|original_name)_exact_idx/);
    assert.ok(after.Plan['Shared Hit Blocks'] + after.Plan['Shared Read Blocks'] < 20);
    await client.unsafe(`create table creator_request_media_items(request_id integer,media_item_id integer,external_creator_name text,primary key(request_id,media_item_id));
      insert into creator_request_media_items select 1,g,'Original Exact' from generate_series(1,100000)g;
      insert into creator_request_media_items values(2,100001,'Rare Studio');
      analyze creator_request_media_items;`);
    const original = db.select({ name: creatorRequestMediaItems.externalCreatorName }).from(creatorRequestMediaItems).where(eq(creatorRequestMediaItems.requestId, 1)).toSQL();
    const [baseline] = await client.unsafe('explain(analyze,buffers,format json) ' + original.sql, original.params as never[]);
    t.diagnostic(JSON.stringify({ variants: 'before-all-observations', memberships: 100000, result: baseline['QUERY PLAN'][0] }));
    for (const requestId of [1, 2, 3]) {
      const bounded = db.selectDistinct({ name: normalizeSearchSql(creatorRequestMediaItems.externalCreatorName) }).from(creatorRequestMediaItems).where(eq(creatorRequestMediaItems.requestId, requestId)).limit(2).toSQL();
      const [row] = await client.unsafe('explain(analyze,buffers,format json) ' + bounded.sql, bounded.params as never[]);
      const result = row['QUERY PLAN'][0];
      assert.equal(result.Plan['Actual Rows'], requestId === 3 ? 0 : 1);
      t.diagnostic(JSON.stringify({ variants: 'after-bounded-distinct', requestId, memberships: 100000, sql: bounded.sql, result }));
    }

  } finally {
    await client.unsafe(`drop schema ${schema} cascade`);
    await client.end();
  }
});
