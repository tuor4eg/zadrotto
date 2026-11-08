import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { PgDialect } from "drizzle-orm/pg-core";

const databaseUrl = process.env.SERIES_MEDIA_SEARCH_TEST_DATABASE_URL;

test("series media search excludes published subtrees before limiting and rechecks stale additions", { skip: !databaseUrl, timeout: 120000 }, async t => {
  const schema = `series_search_${process.pid}_${Date.now()}`;
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const previousUrl = process.env.DATABASE_URL;
  let close: (() => Promise<void>) | undefined;
  try {
    await client.unsafe(`create schema ${schema}`);
    for (const name of (await readdir("drizzle")).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const statement = (await readFile(`drizzle/${name}`, "utf8"))
        .replaceAll('"public".', `"${schema}".`).replaceAll(/\bpublic\./g, `${schema}.`);
      await client.begin(async tx => { await tx.unsafe(statement); });
    }
    process.env.DATABASE_URL = url.toString();
    const { getDbClient } = await import("../src/db");
    close = () => getDbClient().end({ timeout: 2 });
    const { searchPublishedMediaItemsForFranchise, publishedMediaItemsForFranchiseSearchSql, createAuthorMediaItemFranchiseLinks } = await import("../src/db/queries/franchises");
    const [profile] = await client`insert into author_access_profiles(code,name) values ('series-test','Series test') returning id`;
    const [author] = await client`insert into authors(code,name,access_profile_id) values ('series-author','Author',${profile.id}) returning id`;
    const [other] = await client`insert into authors(code,name,access_profile_id) values ('series-other','Other',${profile.id}) returning id`;
    const series = async (title: string, parentId: number | null = null, status = 'published') => (await client`insert into franchises(code,title,parent_id,publication_status) values (${randomUUID()},${title},${parentId},${status}) returning id`)[0].id as number;
    const root = await series('Might and Magic');
    const child = await series('Heroes', root);
    const grandchild = await series('Heroes III', child);
    const unrelated = await series('Another series');
    const hidden = await series('Private child', root, 'private');
    const belowHidden = await series('Published below private', hidden);
    async function media(title: string, seriesId?: number, status = 'published', owner: number | null = null) {
      const [item] = await client`insert into media_items(code,title,media_type,publication_status) values (${randomUUID()},${title},'game','published') returning id`;
      if (seriesId) await client`insert into media_item_franchises(media_item_id,franchise_id,publication_status,created_by_author_id) values (${item.id},${seriesId},${status},${owner})`;
      return item.id as number;
    }
    const direct = await media('Might 01 direct', root);
    const inChild = await media('Might 02 child', child);
    const inGrandchild = await media('Might 03 grandchild', grandchild);
    for (let n = 0; n < 14; n++) await media(`Might 04 hidden existing ${n}`, child);
    const elsewhere = await media('Might 90 unrelated', unrelated);
    const ownPending = await media('Might 91 own pending', root, 'submitted', author.id);
    const otherPrivate = await media('Might 92 other private', root, 'private', other.id);
    const pendingChild = await media('Might 93 pending child', child, 'submitted', author.id);
    const privateBranch = await media('Might 94 private branch', belowHidden);
    const free = await media('Might 95 free');
    const alias = await media('Alias candidate');
    await client`insert into media_item_title_aliases(media_item_id,value) values (${alias},'Might 96 alias')`;
    const russian = await media('Ёж на дороге');
    await client`insert into media_items(code,title,media_type,publication_status) values
      (${randomUUID()},'Might unpublished record','game','private'),
      (${randomUUID()},'Might disabled media type','film','published')`; 
    const search = (franchiseId = root, searchQuery = 'might') => searchPublishedMediaItemsForFranchise({ authorId: author.id, franchiseId, searchQuery, enabledMediaTypeCodes: ['game'] });

    await t.test("only already published memberships in the visible subtree are excluded", async () => {
      const results = await search();
      assert.deepEqual(new Set(results.map(row => row.id)), new Set([elsewhere, ownPending, otherPrivate, pendingChild, privateBranch, free, alias]));
      assert.ok(!results.some(row => [direct, inChild, inGrandchild].includes(row.id)));
      assert.equal(results.find(row => row.id === ownPending)?.canRemove, true);
      assert.equal(results.find(row => row.id === ownPending)?.linkStatus, 'submitted');
      assert.equal(results.find(row => row.id === otherPrivate)?.canRemove, false);
      assert.equal(results.find(row => row.id === otherPrivate)?.linkStatus, 'submitted');
      assert.deepEqual(results.find(row => row.id === alias)?.aliases, ['Might 96 alias']);
      assert.ok((await search(child)).some(row => row.id === direct), 'a parent link does not prevent a more specific child link');
      assert.deepEqual((await search(root, 'еж')).map(row => row.id), [russian]);
      assert.deepEqual(await searchPublishedMediaItemsForFranchise({ authorId: author.id, franchiseId: root, searchQuery: 'might', enabledMediaTypeCodes: [] }), []);
      assert.deepEqual(await search(root, 'm'), []);
    });

    await t.test("stale published descendant results are rejected without links or events", async () => {
      const before = await client`select count(*)::int as count from domain_events`;
      for (const mediaItemId of [inChild, inGrandchild]) for (const publicationStatus of ['published', 'submitted'] as const) {
        assert.equal(await createAuthorMediaItemFranchiseLinks({ authorId: author.id, franchiseIds: [root], mediaItemId, publicationStatus }), null);
      }
      assert.equal(await createAuthorMediaItemFranchiseLinks({ authorId: author.id, franchiseIds: [root, unrelated], mediaItemId: inGrandchild, publicationStatus: 'published' }), null);
      assert.deepEqual(await client`select count(*)::int as count from domain_events`, before);
      assert.equal((await client`select * from media_item_franchises where media_item_id in (${inChild},${inGrandchild}) and franchise_id=${root}`).length, 0);
      assert.ok((await search()).some(row => row.id === free));
      await client`insert into media_item_franchises(media_item_id,franchise_id) values (${free},${child})`;
      assert.equal(await createAuthorMediaItemFranchiseLinks({ authorId: author.id, franchiseIds: [root], mediaItemId: free, publicationStatus: 'published' }), null);
    });

    await t.test("unrelated and pending branches remain addable; refining a parent remains possible", async () => {
      for (const mediaItemId of [elsewhere, pendingChild, privateBranch]) {
        assert.deepEqual((await createAuthorMediaItemFranchiseLinks({ authorId: author.id, franchiseIds: [root], mediaItemId, publicationStatus: 'submitted' }))?.map(row => row.id), [root]);
      }
      assert.deepEqual((await createAuthorMediaItemFranchiseLinks({ authorId: author.id, franchiseIds: [child], mediaItemId: direct, publicationStatus: 'published' }))?.map(row => row.id), [child]);
      assert.deepEqual((await client`select franchise_id from media_item_franchises where media_item_id=${direct}`).map(row => row.franchise_id), [child]);
    });

    await t.test("the recursive branch is built once across many matching candidates", async () => {
      const prefix = randomUUID();
      await client`insert into franchises(code,title) select ${prefix}||'-series-'||n,'Other scale series '||n from generate_series(1,2000) n`;
      await client`insert into media_items(code,title,media_type)
        select ${prefix}||'-record-'||n,'Branchbench record '||lpad(n::text,5,'0'),'game' from generate_series(1,5000) n`;
      await client`insert into media_item_franchises(media_item_id,franchise_id)
        select id,${grandchild} from media_items where code like ${`${prefix}-record-%`} and right(code,1) <> '0'`;
      await client.unsafe('analyze franchises; analyze media_items; analyze media_item_franchises; analyze media_item_title_aliases');
      const query = publishedMediaItemsForFranchiseSearchSql({ authorId: author.id, franchiseId: root, searchQuery: 'branchbench', enabledMediaTypeCodes: ['game'] });
      const compiled = new PgDialect().sqlToQuery(query);
      const plan = await client.unsafe(`explain (analyze,buffers,format json) ${compiled.sql}`, compiled.params);
      await writeFile('/tmp/series-media-search-plan.json', JSON.stringify(plan, null, 2));
      const recursiveNodes: Record<string, unknown>[] = [];
      const walk = (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        if ((value as Record<string, unknown>)['Node Type'] === 'Recursive Union') recursiveNodes.push(value as Record<string, unknown>);
        for (const child of Object.values(value)) {
          if (Array.isArray(child)) child.forEach(walk);
          else if (child && typeof child === 'object') walk(child);
        }
      };
      walk(plan);
      assert.equal(recursiveNodes.length, 1);
      assert.equal(recursiveNodes[0]['Actual Loops'], 1);
      const results = await search(root, 'branchbench');
      assert.equal(results.length, 10);
      const linked = await client`select media_item_id from media_item_franchises where franchise_id=${grandchild}`;
      const linkedIds = new Set(linked.map(row => row.media_item_id));
      assert.ok(results.every(row => !linkedIds.has(row.id)));
      t.diagnostic(`search fixture: 2006 series, 5000 candidates, 4500 descendant memberships; recursive union loops=${recursiveNodes[0]['Actual Loops']}`);
    });
  } finally {
    await close?.();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end({ timeout: 2 });
  }
});
