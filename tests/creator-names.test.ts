import assert from "node:assert/strict";
import { test } from "node:test";

test("creator report names use one bounded PK query, retaining missing-ID fallbacks", { skip: process.env.CREATOR_NAMES_TEST !== "1" }, async t => {
  const { default: postgres } = await import("postgres");
  const original = process.env.DATABASE_URL!;
  const admin = postgres(original, { max: 1, prepare: false, onnotice() {} });
  const schema = `creator_names_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(original);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  try {
    await client.unsafe(`create table creators(id integer primary key,name text);
      insert into creators select i,'Creator '||i from generate_series(1,100000)i;
      update creators set name='Кен Кизи' where id=9; analyze creators`);
    const { getCreatorNamesByIds } = await import("../src/db/queries/creator-names");
    const statements: { query: string; params: unknown[] }[] = [];
    client.options.debug = (_c, query, params) => { if (query.startsWith("select")) statements.push({ query, params: [...params] }); };
    assert.deepEqual(await getCreatorNamesByIds([]), {});
    assert.deepEqual(await getCreatorNamesByIds([0, -1, NaN]), {});
    assert.equal(statements.length, 0);
    const names = await getCreatorNamesByIds([9, 9, 99999, 100001]);
    assert.deepEqual(names, { 9: "Кен Кизи", 99999: "Creator 99999" });
    assert.equal(statements.length, 1, "all report rows resolve together, not N+1");
    client.options.debug = false;
    const { query, params } = statements[0];
    const [explained] = await client.unsafe(`explain(analyze,buffers,format json) ${query}`, params as never[]);
    const plan = explained["QUERY PLAN"][0];
    assert.equal(plan.Plan["Index Name"], "creators_pkey");
    assert.equal(plan.Plan["Actual Rows"], 2);
    t.diagnostic(JSON.stringify({ creators: 100000, ids: 3, rows: 2, executionMs: plan["Execution Time"], index: plan.Plan["Index Name"] }));
  } finally {
    client.options.debug = false;
    await client.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    process.env.DATABASE_URL = original;
  }
});
