import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("0133 requires completed cutover only for providers with existing books", {skip:process.env.PROVIDER_SNAPSHOT_TEST!=="1"}, async()=>{
  await import("dotenv/config");
  const {default:postgres}=await import("postgres");
  const client=postgres(process.env.DATABASE_URL!,{max:1,prepare:false});
  const schema=`book_contract_${process.pid}_${Date.now()}`;
  const migration=await readFile("drizzle/0133_book_snapshot_contract.sql","utf8");
  const apply=()=>client.begin(async tx=>{
    for(const statement of migration.split("--> statement-breakpoint"))if(statement.trim())await tx.unsafe(statement);
  });
  try {
    await client.unsafe(`create schema ${schema}; set search_path=${schema};
      create table media_items(id integer primary key,media_type text);
      create table media_item_metadata(media_item_id integer primary key,source_provider text,facts jsonb);
      create table provider_settings(media_type text,provider_code text,normalized_book_metadata boolean,enabled boolean,primary key(media_type,provider_code));
      insert into media_items values(1,'book'),(2,'film'),(3,'book');
      insert into media_item_metadata values(1,'fantlab','{"originalLanguage":"ru"}'),(2,'google-books','{"unknown":"keep"}'),(3,'other','{"authors":["Keep"]}');
      insert into provider_settings values('book','fantlab',false,true),('book','google-books',false,false);`);
    await assert.rejects(apply(),/BOOK_PROVIDER_CUTOVER_REQUIRED/);
    await client`delete from provider_settings where media_type='book' and provider_code='fantlab'`;
    await assert.rejects(apply(),/BOOK_PROVIDER_CUTOVER_REQUIRED/,'missing setting must also block existing books');
    await client`insert into provider_settings values('book','fantlab',true,true)`;
    const before=await client`select * from media_item_metadata order by media_item_id`;
    await apply();
    assert.deepEqual([...await client`select * from media_item_metadata order by media_item_id`],[...before]);
    assert.equal((await client`select 1 from information_schema.columns where table_schema=${schema} and column_name='normalized_book_metadata'`).length,0);
    assert.deepEqual([...await client`select media_type,provider_code,enabled from provider_settings order by provider_code`],[
      {media_type:'book',provider_code:'fantlab',enabled:true},{media_type:'book',provider_code:'google-books',enabled:false},
    ]);
  } finally {await client.unsafe(`drop schema ${schema} cascade`);await client.end();}
});
