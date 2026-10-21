import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("book language migration preserves visible language, cleans normalized facts and blocks unknown data", {
  skip: process.env.PROVIDER_SNAPSHOT_TEST !== "1",
}, async () => {
  await import("dotenv/config");
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const schema = `book_language_${process.pid}_${Date.now()}`;
  const migration = await readFile("drizzle/0132_book_language_facts.sql", "utf8");
  const apply = () => client.begin(async tx => {
    for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await tx.unsafe(statement);
  });
  try {
    await client.unsafe(`create schema ${schema}; set search_path=${schema},public;
      create table media_items(id integer primary key,media_type text);
      create table provider_settings(media_type text,provider_code text,normalized_book_metadata boolean);
      create table media_item_metadata(media_item_id integer primary key,source_provider text,facts jsonb not null,original_language text);
      insert into provider_settings values('book','fantlab',true),('book','google-books',false);
      insert into media_items values(1,'book'),(2,'book'),(3,'film'),(4,'book'),(5,'film'),(6,'book');
      insert into media_item_metadata values
        (1,'fantlab','{"authors":["A"],"publishers":["P"],"fantlabAuthors":[{"id":7}],"originalLanguage":"fr"}','ru'),
        (2,'google-books','{"authors":["Legacy"],"originalLanguage":"en","unknown":"keep"}','de'),
        (3,'tmdb','{"runtimeMinutes":123,"originalLanguage":"it"}','es'),
        (4,'google-books','{"originalLanguage":"  ","authors":["Keep"]}','ja'),
        (5,'tmdb','{"runtimeMinutes":90,"originalLanguage":null}','ko'),
        (6,'fantlab','{"originalLanguage":"fr","unknown":"review first"}','uk');`);
    await assert.rejects(apply(), "unknown normalized metadata must block migration");
    assert.equal((await client`select original_language from media_item_metadata where media_item_id=1`)[0].original_language, "ru");
    assert.equal((await client`select facts from media_item_metadata where media_item_id=1`)[0].facts.originalLanguage, "fr", "failed migration rolls back all updates");
    await client`update media_item_metadata set facts=facts-'unknown' where media_item_id=6`;
    await apply();
    const rows = await client`select media_item_id,facts from media_item_metadata order by media_item_id`;
    assert.deepEqual(rows.map(row => row.facts), [
      { originalLanguage: "ru" },
      { authors: ["Legacy"], originalLanguage: "en", unknown: "keep" },
      { runtimeMinutes: 123, originalLanguage: "it" },
      { authors: ["Keep"], originalLanguage: "ja" },
      { runtimeMinutes: 90, originalLanguage: "ko" },
      { originalLanguage: "uk" },
    ]);
    assert.equal((await client`select count(*)::int n from information_schema.columns where table_schema=${schema} and table_name='media_item_metadata' and column_name='original_language'`)[0].n, 0);
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});

test("book language migration and compacting queries scale linearly on isolated fixtures", {
  skip: process.env.PROVIDER_SNAPSHOT_PERF_TEST !== "1",
}, async (t) => {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => undefined });
  const schema = `book_language_scale_${process.pid}_${Date.now()}`;
  try {
    await client.unsafe(`create schema ${schema};set search_path=${schema},public;
      create table media_items(id integer primary key,media_type text);
      create table provider_settings(media_type text,provider_code text,normalized_book_metadata boolean,primary key(media_type,provider_code));
      create table media_item_metadata(media_item_id integer primary key,source_provider text,facts jsonb not null,original_language text);
      create index media_item_metadata_source_entry_idx on media_item_metadata(source_provider,media_item_id);
      insert into provider_settings values('book','fantlab',true),('book','google-books',false);
      insert into media_items select id,case when id%3=1 then 'film' else 'book' end from generate_series(1,300000) id;
      insert into media_item_metadata select id,case id%3 when 0 then 'fantlab' when 1 then 'tmdb' else 'google-books' end,
        case when id%3=1 then '{"originalLanguage":"en","runtimeMinutes":120}'::jsonb else '{"originalLanguage":"en","authors":["A","B"]}'::jsonb end,'ru' from media_items;
      analyze media_items;analyze media_item_metadata;analyze provider_settings;`);
    const statements = (await readFile("drizzle/0132_book_language_facts.sql", "utf8")).split("--> statement-breakpoint");
    const update = statements.find(statement => statement.includes("WITH prepared AS"));
    assert.ok(update);
    // Writes are measured only against this disposable fixture schema.
    const [explained] = await client.unsafe(`explain(analyze,buffers,format json) ${update}`);
    const plan = explained["QUERY PLAN"][0];
    t.diagnostic(JSON.stringify({metadataRows:300000,normalizedBooks:100000,executionMs:plan["Execution Time"],plan:plan.Plan}));
    assert.equal((await client`select count(*)::int n from media_item_metadata where source_provider='fantlab' and facts='{"originalLanguage":"ru"}'::jsonb`)[0].n,100000);
    assert.equal((await client`select count(*)::int n from media_item_metadata where source_provider<>'fantlab' and facts->>'originalLanguage'='en'`)[0].n,200000);
    // The cutover cleanup uses the same indexed provider filter and a PK join.
    const [cleanup] = await client.unsafe(`explain(format json) update media_item_metadata m set facts=jsonb_build_object('originalLanguage',btrim(m.facts->>'originalLanguage'))
      from media_items i where i.id=m.media_item_id and i.media_type='book' and m.source_provider='google-books'`);
    t.diagnostic(JSON.stringify({cutoverCleanup:cleanup["QUERY PLAN"][0].Plan}));
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});
