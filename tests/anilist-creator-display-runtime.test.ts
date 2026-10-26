import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { animeCreatorRoleJsonSql } from "../src/db/queries/anilist-creator-display";

const testUrl = process.env.ANILIST_CREATORS_TEST_DATABASE_URL;

test("director projection deduplicates Creators and respects decisions without hiding manual participation", { skip: !testUrl }, async () => {
  const schema = `anilist_director_display_${process.pid}_${Date.now()}`;
  const client = postgres(testUrl!, { max: 1 });
  try {
    await client.unsafe(`create schema ${schema}; set search_path to ${schema};
      create table creator_roles(id integer primary key,code text); insert into creator_roles values(1,'director'),(2,'production_company'),(3,'producer');
      create table creators(id integer primary key,name text,slug text,name_ru text,name_ru_source text,name_ru_processed boolean default false); insert into creators(id,name,slug) values(1,'Director','director'),(2,'Studio','studio');
      create table entry_creators(entry_id integer,creator_id integer,role_id integer,is_manual boolean);
      create table entry_creator_sources(entry_id integer,creator_id integer,role_id integer,source_position integer,binding_id integer,provider text,normalized_external_creator_name text);
      create table provider_creator_bindings(id integer primary key,creator_id integer,external_creator_id text,external_creator_name text,provider text,active boolean);
      create table creator_requests(id integer primary key,external_creator_id text,provider text,media_type text,decision text,manually_reopened boolean);
      create table creator_request_media_items(request_id integer,media_item_id integer,role_id integer,external_creator_name text,source_position integer);
      create table provider_creator_exclusions(provider text,external_creator_id text,media_type text,normalized_external_creator_name text);
      insert into provider_creator_bindings values(1,1,'person:1','Director','anilist',true),(2,1,'person:2','Director','anilist',true);
      insert into creator_requests values(1,'person:1','anilist','anime','link',false),(2,'person:2','anilist','anime','link',false),(3,'person:3','anilist','anime',null,false);
      insert into creator_request_media_items values(1,1,1,'Director',2),(2,1,1,'Director',1),(3,1,1,'Pending',3);
      insert into entry_creators values(1,1,1,false),(1,2,2,true);
      insert into entry_creator_sources values(1,1,1,2,1,'anilist','director'),(1,1,1,1,2,'anilist','director');`);
    const query = new PgDialect().sqlToQuery(sql`select ${animeCreatorRoleJsonSql('director', sql`1`)} as directors`);
    const read = async () => (await client.unsafe(query.sql, query.params as never[]))[0].directors;
    assert.deepEqual(await read(), [{ name: 'Director', creatorId: 1, slug: 'director' }, { name: 'Pending', creatorId: null, slug: null }]);
    await client.unsafe(`
      update creators set name_ru='Студия' where id=2;
      insert into provider_creator_bindings values(3,2,'studio:1','Studio','anilist',true);
      insert into creator_requests values(4,'studio:1','anilist','anime','link',false);
      insert into creator_request_media_items values(4,1,2,'Studio',1),(4,1,3,'Studio',1);
      insert into entry_creators values(1,2,3,false);
      insert into entry_creator_sources values(1,2,2,1,3,'anilist','studio'),(1,2,3,1,3,'anilist','studio');`);
    for (const role of ["production_company", "producer"] as const) {
      const roleQuery = new PgDialect().sqlToQuery(sql`select ${animeCreatorRoleJsonSql(role, sql`1`)} as companies`);
      const [row] = await client.unsafe(roleQuery.sql, roleQuery.params as never[]);
      assert.deepEqual(row.companies, [{ name: 'Студия', creatorId: 2, slug: 'studio' }]);
    }
    // person:1 and studio:1 are separate provider identities even at the same numerical ID.
    await client`insert into provider_creator_exclusions values('anilist','person:1','anime',null),('anilist','person:2','anime',null)`;
    assert.deepEqual(await read(), [{ name: 'Pending', creatorId: null, slug: null }]);
    await client`update entry_creators set is_manual=true where creator_id=1`;
    assert.equal((await read())[0].creatorId, 1, 'manual participation survives all source exclusions');
    await client`delete from provider_creator_exclusions`;
    await client`update entry_creators set is_manual=false where creator_id=1`;
    await client`update creator_requests set manually_reopened=true,decision=null where id in (1,2)`;
    const reopened = await read();
    assert.equal(reopened.some((row: { creatorId: number | null }) => row.creatorId === 1), false);
    assert.deepEqual(reopened.map((row: { name: string }) => row.name), ['Director', 'Director', 'Pending']);
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});
