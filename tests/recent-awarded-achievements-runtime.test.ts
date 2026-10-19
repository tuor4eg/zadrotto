import assert from "node:assert/strict";
import { test } from "node:test";

// Opt-in: uses connection-local temporary tables; application data is never changed.
// NODE_OPTIONS=--conditions=react-server PROFILE_QUERY_TEST=1 tsx --test tests/recent-awarded-achievements-runtime.test.ts
test("recent awards preserve history without evaluating mechanics and scale by author", {
  skip: process.env.PROFILE_QUERY_TEST !== "1",
}, async (t) => {
  await import("dotenv/config");
  process.env.DATABASE_MAX_CONNECTIONS = "1";
  const { getDbClient } = await import("../src/db");
  const { getAchievementShowcase, getRecentAwardedAchievements } = await import("../src/db/queries/achievements");
  const client = getDbClient();
  const statements: Array<{ query: string; params: unknown[] }> = [];
  try {
    const fullStartedAt = performance.now();
    const full = await getAchievementShowcase(1);
    const fullMs = performance.now() - fullStartedAt;
    client.options.debug = (_connection, query, params) => {
      if (query.trim().startsWith("select")) statements.push({ query, params });
    };
    const recentStartedAt = performance.now();
    const recent = await getRecentAwardedAchievements(1);
    t.diagnostic(JSON.stringify({ fullMs, recentMs: performance.now() - recentStartedAt }));
    const stripProgress = (item: typeof full[number]) => Object.fromEntries(
      Object.entries(item).filter(([key]) => key !== "currentValue" && key !== "progressAvailable"),
    );
    const expected = full.filter((item) => item.awardedAt !== null)
      .sort((a, b) => b.awardedAt!.getTime() - a.awardedAt!.getTime()).slice(0, 5);
    assert.deepEqual(recent.map(stripProgress), expected.map(stripProgress));
    assert.ok(recent.every((item) => item.progressAvailable === false));
    assert.equal(statements.length, 1, "only the award-history SELECT runs");
    client.options.debug = false;
    for (const table of ["achievements", "achievement_levels", "user_achievements"]) {
      await client.unsafe(`create temporary table ${table} as select * from public.${table} where false`);
    }
    await client.unsafe(`
      insert into pg_temp.achievements(id,code,name,description,mechanic,params,display_order,enabled,show_when_locked)
      select g,'award-'||g,'Award '||g,null,'rating.authored.count','{}'::jsonb,g,g%2=0,true from generate_series(1,100)g;
      insert into pg_temp.achievement_levels(id,achievement_id,level,threshold,name,rarity)
      select (a-1)*10+l,a,l,l*10,'Level '||l,'common' from generate_series(1,100)a cross join generate_series(1,10)l;
      insert into pg_temp.user_achievements(id,author_id,achievement_level_id,awarded_at)
      select (u-1)*1000+l,u,l,timestamptz '2026-01-01'+l*interval '1 minute'
      from generate_series(1,100)u cross join generate_series(1,1000)l;
      insert into pg_temp.user_achievements(id,author_id,achievement_level_id,awarded_at)
      values (100001,101,1,'2026-01-01');
      create unique index on pg_temp.achievements(id);
      create unique index on pg_temp.achievement_levels(id);
      create unique index on pg_temp.achievement_levels(achievement_id,level);
      create unique index on pg_temp.user_achievements(author_id,achievement_level_id);
      create index on pg_temp.user_achievements(author_id,awarded_at);
      analyze pg_temp.achievements; analyze pg_temp.achievement_levels; analyze pg_temp.user_achievements;
    `);
    const scaled = await getRecentAwardedAchievements(1);
    assert.deepEqual(scaled.map((item) => item.code), [100,99,98,97,96].map((n) => `award-${n}`));
    assert.ok(scaled.every((item) => item.awardedLevels.length === 10 && item.levelCount === 10));
    const partial = await getRecentAwardedAchievements(101);
    assert.equal(partial.length, 1);
    assert.equal(partial[0].highestAwardedLevel, 1);
    assert.equal(partial[0].nextLevel, 2);
    assert.equal(partial[0].progressAvailable, false);
    assert.deepEqual(await getRecentAwardedAchievements(999999), []);
    // Lower-level backfill must not change which chain counts as the latest.
    await client.unsafe("update pg_temp.user_achievements set awarded_at='2030-01-01' where author_id=1 and achievement_level_id=1");
    assert.deepEqual((await getRecentAwardedAchievements(1)).map((item) => item.code), scaled.map((item) => item.code));
    for (const authorId of [1, 101, 999999]) {
      statements.length = 0;
      client.options.debug = (_connection, query, params) => statements.push({ query, params });
      await getRecentAwardedAchievements(authorId);
      client.options.debug = false;
      const compiled = statements[0];
      const [row] = await client.unsafe("explain(analyze,buffers,format json) " + compiled.query, compiled.params as never[]);
      const plan = row["QUERY PLAN"][0];
      const nodes: Array<{ type: string; table?: string; index?: string; rows: number; loops: number }> = [];
      const walk = (node: Record<string, unknown>) => {
        nodes.push({ type: String(node["Node Type"]), table: node["Relation Name"] as string | undefined,
          index: node["Index Name"] as string | undefined, rows: Number(node["Actual Rows"]), loops: Number(node["Actual Loops"]) });
        for (const child of (node.Plans ?? []) as Record<string, unknown>[]) walk(child);
      };
      walk(plan.Plan);
      assert.ok(nodes.some((node) => node.index?.startsWith("user_achievements_author_id")), "uses author-scoped index");
      assert.ok(!nodes.some((node) => node.table === "user_achievements" && node.type === "Seq Scan"), "does not scan other authors' awards");
      t.diagnostic(JSON.stringify({ authorId, awards: 100001, ms: plan["Execution Time"], nodes }));
    }
  } finally {
    client.options.debug = false;
    await client.end();
  }
});
