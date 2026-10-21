import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("historical 0128 seeds settings without overriding network preferences", {skip:process.env.PROVIDER_SNAPSHOT_TEST!=="1"}, async()=>{
  await import("dotenv/config");
  const {default:postgres}=await import("postgres");
  const client=postgres(process.env.DATABASE_URL!,{max:1,prepare:false});
  const schema=`book_gate_history_${process.pid}_${Date.now()}`;
  try {
    await client.unsafe(`create schema ${schema}; set search_path=${schema}; create table provider_settings(media_type text,provider_code text,enabled boolean,title_search_mode text,cover_search_enabled boolean,priority integer,primary key(media_type,provider_code));`);
    await client.unsafe(`insert into provider_settings(media_type,provider_code,enabled,title_search_mode,cover_search_enabled,priority) values('book','google-books',false,'fallback',false,71),('film','fantlab',false,'off',false,99)`);
    for(const statement of (await readFile("drizzle/0128_book_provider_cutover_settings.sql","utf8")).split('--> statement-breakpoint'))await client.unsafe(statement);
    const networkSettings=await client`select media_type,provider_code,enabled,title_search_mode,cover_search_enabled,priority,normalized_book_metadata from provider_settings order by media_type,provider_code`;
    assert.deepEqual([...networkSettings],[
      {media_type:'book',provider_code:'fantlab',enabled:true,title_search_mode:'parallel',cover_search_enabled:true,priority:30,normalized_book_metadata:false},
      {media_type:'book',provider_code:'google-books',enabled:false,title_search_mode:'fallback',cover_search_enabled:false,priority:71,normalized_book_metadata:false},
      {media_type:'book',provider_code:'open-library',enabled:true,title_search_mode:'parallel',cover_search_enabled:true,priority:10,normalized_book_metadata:false},
      {media_type:'film',provider_code:'fantlab',enabled:false,title_search_mode:'off',cover_search_enabled:false,priority:99,normalized_book_metadata:false},
    ],'migration preserves existing settings and seeds absent providers with runtime defaults');
    await client`delete from provider_settings where media_type='book' and provider_code='google-books'`;
    await client.unsafe((await readFile('drizzle/0128_book_provider_cutover_settings.sql','utf8')).split('--> statement-breakpoint')[1]);
    const [googleDefault]=await client`select enabled,title_search_mode,cover_search_enabled,priority,normalized_book_metadata from provider_settings where media_type='book' and provider_code='google-books'`;
    assert.deepEqual(googleDefault,{enabled:true,title_search_mode:'parallel',cover_search_enabled:true,priority:20,normalized_book_metadata:false});
  } finally {await client.unsafe(`drop schema ${schema} cascade`);await client.end();}
});
