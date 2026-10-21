import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { snapshotHash } from "../src/lib/providers/snapshot-values";
import { describeTmdbFilmSource } from "../src/lib/providers/tmdb-film-adapter";

test("TMDB film genre migration requires linked evidence and preserves unrelated facts", {
  skip: process.env.PROVIDER_SNAPSHOT_TEST !== "1",
}, async t => {
  await import("dotenv/config");
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const schema = `film_genres_${process.pid}_${Date.now()}`;
  const migration = await readFile("drizzle/0134_tmdb_film_genre_facts.sql", "utf8");
  const statements = migration.split("--> statement-breakpoint").filter(value => value.trim());
  const apply = () => client.begin(async tx => { for (const statement of statements) await tx.unsafe(statement); });
  const params = describeTmdbFilmSource("42").requestParams;
  const key = snapshotHash(params);
  assert.ok(migration.includes(key));
  try {
    await client.unsafe(`create schema ${schema}; set search_path=${schema},public;
      create table media_items(id integer primary key,media_type text);
      create table media_item_metadata(media_item_id integer primary key,source_provider text,source_external_id text,facts jsonb);
      create table provider_snapshots(id integer primary key,provider_code text,resource_type text,external_id text,api_method text,request_key text,request_params jsonb,payload jsonb);
      create unique index snapshot_descriptor on provider_snapshots(provider_code,resource_type,external_id,api_method,request_key);
      create table provider_snapshot_links(snapshot_id integer,entity_type text,entity_id text,purpose text,primary key(snapshot_id,entity_type,entity_id,purpose));
      create index snapshot_links_entity on provider_snapshot_links(entity_type,entity_id,purpose,snapshot_id);
      insert into media_items values(1,'film'),(2,'film'),(3,'series'),(4,'film');
      insert into media_item_metadata values
        (1,'tmdb','42','{"genres":["Drama"],"genreReferences":[{"id":"18","name":"Drama"}],"runtimeMinutes":123,"manual":"keep","unknown":{"future":true}}'),
        (2,'tmdb','42','{"genres":["Drama"],"productionCompanies":["Studio"]}'),
        (3,'tmdb','42','{"genres":["Series genre"],"seasonCount":7}'),
        (4,'other','42','{"genres":["Other genre"],"manual":"untouched"}');`);
    await client`insert into provider_snapshots values(1,'tmdb','movie','42','movie.details',${key},${client.json(params)},'{"id":42,"genres":[{"id":18,"name":"Drama"}]}')`;
    const before = await client`select * from media_item_metadata order by media_item_id`;
    const blocked = async () => {
      await assert.rejects(apply(), /TMDB_FILM_GENRE_SNAPSHOT_REQUIRED/);
      assert.deepEqual(await client`select * from media_item_metadata order by media_item_id`, before);
    };
    await blocked();
    await client`insert into provider_snapshot_links values(1,'media-item','1','primary'),(1,'media-item','2','dependency')`;
    await blocked();
    await client`update provider_snapshot_links set purpose='primary' where entity_id='2'`;
    for (const change of [
      "update provider_snapshots set api_method='tv.details'",
      "update provider_snapshots set resource_type='tv'",
      "update provider_snapshots set external_id='43'",
      "update provider_snapshots set request_key='wrong'",
      "update provider_snapshots set request_params='{}'",
      "update provider_snapshots set payload=jsonb_set(payload,'{id}','43')",
      "update provider_snapshots set payload=jsonb_set(payload,'{genres}','{}')",
      "update provider_snapshots set payload=jsonb_set(payload,'{genres}','[{\"id\":18}]')",
    ]) {
      await assert.rejects(client.begin(async tx => {
        await tx.unsafe(change);
        for (const statement of statements) await tx.unsafe(statement);
      }), /TMDB_FILM_GENRE_SNAPSHOT_REQUIRED/);
    }
    await apply();
    const compact = await client`select facts from media_item_metadata order by media_item_id`;
    assert.deepEqual(compact.map(row => row.facts), [
      { runtimeMinutes: 123, manual: "keep", unknown: { future: true } },
      { productionCompanies: ["Studio"] }, before[2].facts, before[3].facts,
    ]);
    await apply();
    await client`delete from provider_snapshot_links`;
    await apply();
    await client.unsafe(`insert into media_items select g,case when g%5=0 then 'film' else 'series' end from generate_series(100,100099)g;
      insert into media_item_metadata select id,'tmdb',id::text,'{"genres":["Drama","Comedy","Adventure"]}' from media_items where id>=100;`);
    await client`insert into provider_snapshots
      select id,'tmdb','movie',id::text,'movie.details',${key},${client.json(params)},
        jsonb_build_object('id',id,'genres',jsonb_build_array(
          jsonb_build_object('id',18,'name','Drama'),jsonb_build_object('id',35,'name','Comedy'),
          jsonb_build_object('id',12,'name','Adventure')))
      from media_items where id>=100 and media_type='film'`;
    await client`insert into provider_snapshots
      select id+200000,'tmdb','tv',id::text,'tv.details',${key},${client.json(params)},
        jsonb_build_object('id',id,'genres',jsonb_build_array(jsonb_build_object('id',18,'name','Drama')))
      from media_items where id>=100 and media_type='series'`;
    await client.unsafe(`insert into provider_snapshot_links select id,'media-item',id::text,'primary' from media_items where id>=100 and media_type='film';
      analyze media_items; analyze media_item_metadata; analyze provider_snapshot_links; analyze provider_snapshots`);
    const preflight = migration.match(/IF EXISTS \(([\s\S]*?)\n  \) THEN/)?.[1];
    assert.ok(preflight);
    const [plan] = await client.unsafe("explain(analyze,buffers,format json) " + preflight);
    assert.match(JSON.stringify(plan), /provider_snapshot_links|snapshot_links_entity/);
    const update = statements.find(statement => /^\s*UPDATE media_item_metadata/m.test(statement));
    assert.ok(update);
    const [updatePlan] = await client.unsafe("explain(format json) " + update);
    t.diagnostic(JSON.stringify({ metadataRows: 100004, targetFilms: 20000, snapshots: 100001, genresPerFilm: 3,
      preflightPlan: plan["QUERY PLAN"], updatePlan: updatePlan["QUERY PLAN"] }));
    await apply();
    assert.equal((await client`select count(*)::int n from media_item_metadata m join media_items i on i.id=m.media_item_id where i.media_type='film' and m.source_provider='tmdb' and m.facts ?| array['genres','genreReferences']`)[0].n, 0);
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});
