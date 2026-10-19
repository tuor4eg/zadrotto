import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "redis";
import { createGameProviderFetch, GameProviderDeferredError } from "../src/lib/covers/game-provider-budget";
import { getFixedWindowRateLimitKey } from "../src/lib/rate-limits/redis";

test("game provider transport fails closed when Redis is unavailable",async()=>{
  let calls=0;
  const request=createGameProviderFetch({redis:async()=>null,fetch:async()=>{calls++;return new Response("{}");}});
  await assert.rejects(request("rawg","https://example.invalid"),error=>error instanceof GameProviderDeferredError && error.code==="rate-limit-unavailable" && error.retryAfterSeconds===60);
  assert.equal(calls,0);
});

test("game provider Redis admission shares ordinary/backfill daily quota and enforces slots",{skip:!process.env.GAME_PROVIDER_TEST_REDIS_URL},async()=>{
  // The supplied Redis must be disposable: these are deliberately the production key names.
  const client=createClient({url:process.env.GAME_PROVIDER_TEST_REDIS_URL});
  await client.connect();
  let calls=0;
  let limit:number|null=102;
  let response=()=>new Response("{}");
  const request=createGameProviderFetch({redis:async()=>client,dailyLimit:async()=>limit,fetch:async()=>{calls++;return response();}});
  const key=(provider:"igdb"|"rawg")=>getFixedWindowRateLimitKey({keyPrefix:"cover-search:provider",subject:provider,window:"day",limit:102});
  try {
    await client.flushDb();
    await request("rawg","https://example.invalid",{},true);
    assert.equal(await client.get(key("rawg")),"1");
    await assert.rejects(request("rawg","https://example.invalid"),error=>error instanceof GameProviderDeferredError && error.code==="provider-rate-limit");
    assert.equal(calls,1);
    assert.equal(await client.get(key("rawg")),"1");
    await client.del("game-provider:rawg:second");
    await request("rawg","https://example.invalid",{},true);
    await client.del("game-provider:rawg:second");
    await assert.rejects(request("rawg","https://example.invalid",{},true),error=>error instanceof GameProviderDeferredError && error.code==="provider-daily-limit" && error.retryAfterSeconds>0);
    await request("rawg","https://example.invalid");
    assert.equal(await client.get(key("rawg")),"3");
    await client.del("game-provider:rawg:second");
    await client.set(key("rawg"),"102");
    await assert.rejects(request("rawg","https://example.invalid"),error=>error instanceof GameProviderDeferredError && error.code==="provider-daily-limit");
    await client.flushDb();
    limit=null;
    await request("igdb","https://example.invalid");
    await request("igdb","https://example.invalid");
    await request("igdb","https://example.invalid");
    await assert.rejects(request("igdb","https://example.invalid"),error=>error instanceof GameProviderDeferredError && error.code==="provider-rate-limit");
    assert.equal(await client.get(key("igdb")),"3");
    await client.flushDb();
    response=()=>new Response("{}",{status:429,headers:{"Retry-After":"17"}});
    await assert.rejects(request("rawg","https://example.invalid"),error=>error instanceof GameProviderDeferredError && error.retryAfterSeconds===17);
    assert.ok(await client.pTTL("game-provider:rawg:cooldown")>15000);
    const before=calls;
    await assert.rejects(request("rawg","https://example.invalid"),error=>error instanceof GameProviderDeferredError && error.code==="provider-rate-limit");
    assert.equal(calls,before);
    assert.equal(await client.zCard("game-provider:rawg:active"),0);
    await client.flushDb();
    // Two live IGDB leases block admission without consuming quota; expired leases are reclaimed.
    await client.zAdd("game-provider:igdb:active",[{score:Date.now()+10000,value:"a"},{score:Date.now()+10000,value:"b"}]);
    await assert.rejects(request("igdb","https://example.invalid"),error=>error instanceof GameProviderDeferredError && error.code==="provider-rate-limit");
    assert.equal(await client.get(key("igdb")),null);
    await client.zAdd("game-provider:igdb:active",[{score:Date.now()-1,value:"a"},{score:Date.now()-1,value:"b"}]);
    response=()=>new Response("{}");
    await request("igdb","https://example.invalid");
    assert.equal(await client.get(key("igdb")),"1");
  } finally {await client.flushDb();await client.close();}
});
