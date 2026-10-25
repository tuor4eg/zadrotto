import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { tmdbCreatorRoleJsonSql } from "../src/db/queries/tmdb-company-display";

const url = process.env.TMDB_SERIES_DISPLAY_TEST_DATABASE_URL;
test("series display preserves multiple roles, decisions, aliases and localized names", { skip: !url }, async () => {
  const client = postgres(url!, { max: 1 });
  const schema = `tmdb_series_display_${process.pid}_${Date.now()}`;
  const dialect = new PgDialect();
  try {
    await client.unsafe(`create schema ${schema}; set search_path=${schema},public;
      create unlogged table creator_roles(id int primary key,code text); insert into creator_roles values(1,'production_company'),(2,'network'),(3,'creator'),(4,'showrunner');
      create unlogged table creators(id int primary key,name text,name_ru text,slug text);
      create unlogged table media_items(id int primary key,code text,media_type text);
      create unlogged table entry_creators(entry_id int,creator_id int,role_id int,is_manual boolean,primary key(entry_id,creator_id,role_id));
      create index on entry_creators(creator_id,role_id,entry_id);
      create unlogged table entry_creator_sources(entry_id int,creator_id int,role_id int,source_position int,binding_id int,provider text,normalized_external_creator_name text,
        primary key(entry_id,creator_id,role_id,provider,normalized_external_creator_name));
      create index on entry_creator_sources(binding_id);
      create unlogged table provider_creator_bindings(id int primary key,creator_id int,external_creator_id text,external_creator_name text,provider text,active boolean);
      create index on provider_creator_bindings(provider,external_creator_id); create index on provider_creator_bindings(creator_id);
      create unlogged table creator_requests(id int primary key,external_creator_id text,provider text,media_type text,decision text,manually_reopened boolean);
      create unique index on creator_requests(provider,external_creator_id) where external_creator_id is not null;
      create unlogged table creator_request_media_items(request_id int,media_item_id int,role_id int,external_creator_name text,source_position int,primary key(request_id,media_item_id,role_id));
      create index on creator_request_media_items(media_item_id);
      create unlogged table provider_creator_exclusions(provider text,external_creator_id text,media_type text,normalized_external_creator_name text);
      create unique index on provider_creator_exclusions(provider,external_creator_id) where external_creator_id is not null;
      create unique index on provider_creator_exclusions(provider,media_type,normalized_external_creator_name) where external_creator_id is null;
      insert into creators values(1,'Person','Русское Имя','person'),(2,'Studio',null,'studio');
      insert into media_items values(1,'one','series');
      insert into provider_creator_bindings values(1,1,'person:1','Person','tmdb',true),(2,1,'person:2','Alias','tmdb',true),(3,2,'company:1','Studio','tmdb',true);
      insert into creator_requests values(1,'person:1','tmdb','series','link',false),(2,'person:2','tmdb','series','link',false),(3,'person:3','tmdb','film',null,false),(4,'company:1','tmdb','series','link',false);
      insert into creator_request_media_items values(1,1,3,'Person',2),(2,1,3,'Alias',1),(3,1,4,'Pending Showrunner',3),(4,1,1,'Studio',0);
      insert into entry_creators values(1,1,3,false),(1,1,4,true),(1,2,1,false),(1,2,2,true);
      insert into entry_creator_sources values(1,1,3,2,1,'tmdb','person'),(1,1,3,1,2,'tmdb','alias'),(1,2,1,0,3,'tmdb','studio');`);
    const projection = (entry: ReturnType<typeof sql>) => sql`select
      ${tmdbCreatorRoleJsonSql("production_company", entry, "series")} as production,
      ${tmdbCreatorRoleJsonSql("network", entry, "series")} as networks,
      ${tmdbCreatorRoleJsonSql("creator", entry, "series")} as creators,
      ${tmdbCreatorRoleJsonSql("showrunner", entry, "series")} as showrunners`;
    const query = dialect.sqlToQuery(projection(sql`1`));
    const read = async () => (await client.unsafe(query.sql, query.params as never[]))[0];
    let row = await read();
    assert.deepEqual(row.creators, [{ name: "Русское Имя", creatorId: 1, slug: "person" }], "aliases deduplicate within a role");
    assert.equal(row.showrunners.find((r: { creatorId: number | null }) => r.creatorId === 1)?.creatorId, 1, "same person remains present in a second role");
    assert.equal(row.showrunners.find((r: { creatorId: number | null }) => r.creatorId === null)?.name, "Pending Showrunner");
    assert.equal(row.production[0].creatorId, 2);
    assert.equal(row.networks[0].creatorId, 2);
    await client`insert into provider_creator_exclusions values('tmdb','person:1','series',null),('tmdb','person:2','series',null)`;
    row = await read(); assert.deepEqual(row.creators, []); assert.equal(row.showrunners.find((r: { creatorId: number | null }) => r.creatorId === 1)?.creatorId, 1, "manual source survives exclusions");
    await client`delete from provider_creator_exclusions`;
    await client`update creator_requests set manually_reopened=true,decision=null where id in (1,2)`;
    row = await read(); assert.deepEqual(row.creators.map((r: {creatorId: number | null}) => r.creatorId), [null, null]);
    await client`update creator_requests set manually_reopened=false,decision='link' where id in (1,2)`;
    await client`insert into provider_creator_exclusions values('tmdb',null,'film','pending showrunner')`;
    assert.equal((await read()).showrunners.length, 2, "film exclusions do not affect series names");

    if (process.env.TMDB_SERIES_DISPLAY_PERF === "1") {
      await client.unsafe(`insert into creators select n,'Person '||n,null,'creator-'||n from generate_series(3,100000)n;
        insert into media_items select n,'series-'||n,'series' from generate_series(2,100000)n;
        insert into entry_creators select n,1+(n+k)%100000,1+(k%4),false from generate_series(2,100000)n cross join generate_series(0,9)k;
        insert into provider_creator_bindings select n,1+(n%100000),'person:'||(100000+n),'Person','tmdb',true from generate_series(4,200003)n;
        insert into creator_requests select n,'person:'||(100000+n),'tmdb','series','link',false from generate_series(5,200003)n;
        insert into creator_request_media_items select 5+(n%199999),n,1,'Provider person '||n,0 from generate_series(2,100000)n;
        insert into entry_creator_sources select entry_id,creator_id,role_id,0,4+(creator_id%200000),'tmdb','person-'||creator_id from entry_creators where entry_id>1;
        insert into provider_creator_exclusions select 'tmdb','person:'||(900000+n),'series','excluded '||n from generate_series(1,25000)n;
        insert into provider_creator_exclusions select 'tmdb',null,'series','excluded name '||n from generate_series(1,25000)n;
        analyze creators; analyze media_items; analyze entry_creators; analyze entry_creator_sources;
        analyze provider_creator_bindings; analyze creator_requests; analyze creator_request_media_items;
        analyze creator_roles; analyze provider_creator_exclusions;`);
      const plans = [];
      for (const id of [50000, 1, 100001]) {
        const generated = dialect.sqlToQuery(projection(sql`${id}`));
        const [result] = await client.unsafe(`explain(analyze,buffers,format json) ${generated.sql}`, generated.params as never[]);
        const plan = result["QUERY PLAN"][0];
        plans.push({ id, ...generated, plan });
        console.log("series display", id, plan["Execution Time"], "ms");
      }
      writeFileSync("/tmp/tmdb-series-display-plans.json", JSON.stringify(plans, null, 2));
    }
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});
