import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";
import { PgDialect } from "drizzle-orm/pg-core";

const databaseUrl = process.env.DIGITAL_PROFILE_TEST_DATABASE_URL;

test("digital profile preserves branch statistics without repeated rated-item scans", { skip: !databaseUrl, timeout: 120000 }, async t => {
  const schema = `digital_profile_${process.pid}_${Date.now()}`;
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const previousUrl = process.env.DATABASE_URL;
  const previousMax = process.env.DATABASE_MAX_CONNECTIONS;
  let close: (() => Promise<void>) | undefined;
  try {
    await client.unsafe(`create schema ${schema}`);
    await client.unsafe(`
      create table media_types(code text primary key, name text not null);
      create table media_items(id integer primary key, media_type text not null, publication_status text not null);
      create table ratings(id serial primary key, author_id integer not null, media_item_id integer not null, part_id integer, score integer);
      create index ratings_author_media_idx on ratings(author_id, media_item_id);
      create table franchises(id integer primary key, code text not null, title text not null, parent_id integer, publication_status text not null);
      create index franchises_parent_idx on franchises(parent_id);
      create table media_item_franchises(media_item_id integer not null, franchise_id integer not null, publication_status text not null, primary key(media_item_id,franchise_id));
      create index media_item_franchises_franchise_idx on media_item_franchises(franchise_id,media_item_id);
      insert into media_types values ('game','Игра'),('film','Фильм'),('anime','Аниме');
      insert into franchises values
        (1,'root','Universe',null,'published'),(2,'games','Games',1,'published'),
        (3,'deep','Games deep',2,'published'),(4,'films','Films',1,'published'),
        (5,'hidden','Hidden',1,'private'),(6,'below-hidden','Below hidden',5,'published');
      insert into media_items select n,case when n=5 then 'film' when n=8 then 'anime' else 'game' end,
        case when n=6 then 'private' else 'published' end from generate_series(1,10)n;
      insert into ratings(author_id,media_item_id,part_id,score) values
        (1,1,null,80),(1,1,1,90),(1,2,1,70),(1,3,null,null),
        (1,6,null,80),(1,7,null,80),(1,8,null,80),(1,9,null,80),(1,10,null,80);
      insert into media_item_franchises values
        (1,3,'published'),(1,1,'published'),(2,3,'published'),(3,3,'published'),
        (3,2,'published'),(4,3,'published'),(5,4,'published'),(6,3,'published'),
        (7,3,'submitted'),(8,3,'published'),(9,5,'published'),(10,6,'published');
    `);
    process.env.DATABASE_URL = url.toString();
    process.env.DATABASE_MAX_CONNECTIONS = "1";
    const { getDbClient } = await import("../src/db");
    const appClient = getDbClient();
    close = () => appClient.end({ timeout: 2 });
    const { getAuthorDigitalProfile, authorDigitalProfileSql } = await import("../src/db/queries/author-digital-profile");
    const enabled = ["game", "film"];

    await t.test("counts records once across parts and overlapping links; respects visibility and type filters", async () => {
      const profile = await getAuthorDigitalProfile(1, enabled);
      assert.deepEqual(profile, {
        strongestSeries: { id: 3, code: "deep", title: "Games deep" },
        strongestSeriesCount: 3,
        bestKnownType: { code: "game", name: "Игра" },
        unexploredType: { code: "film", name: "Фильм" },
        activeSeries: { id: 3, code: "deep", title: "Games deep" },
        seriesRated: 3,
        seriesTotal: 4,
      });
    });

    await t.test("handles empty profiles, disabled types and complete branches", async () => {
      const empty = {
        strongestSeries: null, strongestSeriesCount: 0, bestKnownType: null,
        unexploredType: null, activeSeries: null, seriesRated: 0, seriesTotal: 0,
      };
      assert.deepEqual(await getAuthorDigitalProfile(1, []), empty);
      assert.deepEqual(await getAuthorDigitalProfile(2, enabled), empty);
      await client`insert into ratings(author_id,media_item_id,score) values (1,4,80),(1,5,80)`;
      const profile = await getAuthorDigitalProfile(1, enabled);
      assert.equal(profile.strongestSeries?.id, 1);
      assert.equal(profile.strongestSeriesCount, 5);
      assert.equal(profile.activeSeries, null);
      assert.equal(profile.unexploredType, null);
    });

    await t.test("keeps JIT disabled only inside the read transaction", async () => {
      await appClient`set jit = on`;
      await getAuthorDigitalProfile(1, enabled);
      assert.equal((await appClient`show jit`)[0].jit, "on");
    });

    await t.test("uses one hashed membership lookup at representative fan-out", async () => {
      await client.unsafe(`truncate ratings,media_item_franchises,franchises,media_items;
        insert into franchises select n,'series-'||n,'Series '||n,
          case when n<=10 then null else ((n-11)%10)+1 end,'published' from generate_series(1,600)n;
        insert into media_items select n,case when n<=2000 then 'game' else 'film' end,'published' from generate_series(1,4000)n;
        insert into ratings(author_id,media_item_id,score) select 1,n,80 from generate_series(1,2400)n;
        insert into media_item_franchises select n,11+((n-1)%590),'published' from generate_series(1,4000)n;
        insert into media_item_franchises select n,1+((n-1)%10),'published' from generate_series(7,4000,7)n;
        analyze;
      `);
      const query = new PgDialect().sqlToQuery(authorDigitalProfileSql(1, enabled));
      const rows = await client.begin("read only", async tx => {
        await tx`set local jit = off`;
        return tx.unsafe("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + query.sql, query.params);
      });
      const plan = rows[0]["QUERY PLAN"][0];
      await writeFile("/tmp/zadrotto-digital-profile-optimized-plan.json", JSON.stringify(plan, null, 2));
      const nodes: Record<string, unknown>[] = [];
      function visit(node: Record<string, unknown>) {
        nodes.push(node);
        for (const child of (node.Plans ?? []) as Record<string, unknown>[]) visit(child);
      }
      visit(plan.Plan);
      assert.ok(nodes.some(node => node["Subplan Name"]?.toString().includes("SubPlan")));
      const ratedScans = nodes.filter(node => node["CTE Name"] === "user_rated_items");
      assert.ok(ratedScans.length > 0);
      assert.ok(ratedScans.every(node => Number(node["Actual Loops"]) <= 1));
      const profile = await getAuthorDigitalProfile(1, enabled);
      assert.ok(profile.strongestSeriesCount > 0);
      t.diagnostic(`4000 records, 2400 rated, 600 series: execution ${plan["Execution Time"]} ms`);
    });
  } finally {
    await close?.();
    process.env.DATABASE_URL = previousUrl;
    process.env.DATABASE_MAX_CONNECTIONS = previousMax;
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end({ timeout: 2 });
  }
});
