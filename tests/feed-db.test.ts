import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgDialect } from "drizzle-orm/pg-core";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { FEED_PAGE_SIZE, parseFeedCursor } from "../src/lib/feed/model";

test("live feed visibility, updates, exact cursors, pagination and scale", { skip: !process.env.FEED_TEST_DATABASE_URL, timeout: 600000 }, async t => {
  const name = `feed_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(process.env.FEED_TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const url = new URL(process.env.FEED_TEST_DATABASE_URL!); url.pathname = `/${name}`;
  let client: ReturnType<typeof postgres> | undefined;
  let closeApp: (() => Promise<void>) | undefined;
  const oldUrl = process.env.DATABASE_URL;
  try {
    await admin.unsafe(`create database "${name}"`);
    client = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    await client.unsafe(`
      insert into authors(id,code,name,access_profile_id) values (10001,'feed-viewer','Читатель',2),(10002,'feed-friend','Друг',2),(10003,'feed-other','Другой',2);
      insert into author_friendships(first_author_id,second_author_id,requested_by_author_id,status,accepted_at) values(10001,10002,10001,'accepted',now());
      insert into author_friendships(first_author_id,second_author_id,requested_by_author_id,status) values(10001,10003,10001,'pending');
      insert into media_items(id,code,title,media_type,created_by_author_id,created_at) values
        (10001,'feed-one','Первая','game',10003,'2026-01-01T00:00:00.000001Z'),
        (10002,'feed-two','Вторая','game',10002,'2026-01-01T00:00:00.000002Z'),
        (10003,'feed-film','Фильм','film',null,'2026-01-01T00:00:00.000003Z');
      insert into title_parts(id,media_item_id,type,number,sort_order) values(10001,10001,'season',1,1);
      insert into ratings(id,author_id,media_item_id,score,created_at,updated_at) values
        (10001,10002,10001,80,'2020-01-01','2026-02-01T00:00:00.000001Z'),
        (10002,10003,10002,90,'2020-01-01','2026-02-01'),
        (10003,10001,10002,70,'2020-01-01','2026-02-01');
      insert into ratings(id,author_id,media_item_id,part_id,score,updated_at) values(10004,10002,10001,10001,60,'2026-02-02');
      insert into author_media_statuses(id,author_id,media_item_id,status,updated_at) values(10001,10002,10002,'wanted','2026-02-01T00:00:00.000002Z');
      insert into franchises(id,code,title,created_by_author_id,created_at) values(10001,'feed-series','Серия',10003,'2026-01-02');
      insert into franchises(id,code,title,created_by_author_id,created_at) values(10002,'feed-friend-series','Серия друга',10002,'2026-01-02');
      insert into media_item_franchises(media_item_id,franchise_id,publication_status) values(10001,10001,'published');
      insert into contributions(id,type,author_id,primary_media_item_id,status,created_at) values(10001,'review',10003,10001,'published','2026-01-03');
      insert into contribution_reviews(contribution_id,title,body) values(10001,'Рецензия','Текст');
      insert into contributions(id,type,author_id,primary_media_item_id,status,created_at) values(10002,'review',10002,10002,'published','2026-01-03');
      insert into contribution_reviews(contribution_id,title,body) values(10002,'Рецензия друга','Текст');
      insert into achievements(id,code,name,mechanic,params,enabled,show_when_locked) values(10001,'feed-award','Ачивка','rating.authored.count','{}',false,false);
      insert into achievement_levels(id,achievement_id,level,threshold,name,rarity,image_object_key) values
        (10001,10001,1,1,'Первый уровень','common','achievements/10001/12345678-1234-4123-8123-123456789012.webp'),
        (10002,10001,2,2,'Второй уровень','common',null);
      insert into user_achievements(id,author_id,achievement_level_id,award_group_id,awarded_at) values
        (10001,10002,10001,gen_random_uuid(),'2026-02-03T00:00:00.000001Z'),
        (10002,10002,10002,gen_random_uuid(),'2026-02-03T00:00:00.000001Z'),
        (10003,10003,10001,gen_random_uuid(),'2026-02-03'),
        (10004,10001,10001,gen_random_uuid(),'2026-02-03');
      insert into editorial_documents(id,kind) values(10001,'collection');
      insert into editorial_collections(document_id,title,slug,publication_status,created_at) values(10001,'Подборка','feed-collection','published','2026-01-04');
    `);
    process.env.DATABASE_URL = url.toString();
    const { getDbClient } = await import("../src/db");
    const { getFeedPage, getFeedFriends, getFeedMediaTiles, buildFeedQuery } = await import("../src/db/queries/feed");
    closeApp = () => getDbClient().end();
    const input = { authorId: 10001, mediaTypeCodes: ["game"] };

    await t.test("seven kinds, parts, and no personal data for guests or non-friends", async () => {
      await client!`update media_items set release_year=1999 where id=10001`;
      const page = await getFeedPage(input);
      assert.equal(page.items.find(item => item.key === "media-10001")?.releaseYear, 1999);
      assert.ok(page.items.find(item => item.key === "media-10001")?.mediaTypeName);
      const widget = await getFeedPage({ ...input, publicOnly: true, pageSize: 5 });
      assert.equal(widget.items.length, 5);
      assert.ok(widget.items.every(item => ["media", "series", "review", "collection"].includes(item.kind)));
      assert.deepEqual(widget.items.map(item => item.key), (await getFeedPage({ ...input, authorId: undefined, publicOnly: true, pageSize: 5 })).items.map(item => item.key));

      assert.deepEqual(new Set(page.items.map(item => item.kind)), new Set(["media", "series", "review", "collection", "rating", "wanted", "achievement"]));
      const friendsPage = await getFeedPage({ ...input, friendsOnly: true });
      assert.deepEqual(new Set(friendsPage.items.map(item => item.key)), new Set(["media-10002", "series-10002", "review-10002", "rating-10001", "rating-10004", "wanted-10001", "achievement-10001", "achievement-10002"]));
      assert.ok(friendsPage.items.every(item => item.actorId === 10002));
      const tiles = await getFeedMediaTiles(page.items, input.authorId);
      assert.equal(tiles.length, 2);
      assert.equal(new Set(tiles.map(tile => tile.mediaItemId)).size, tiles.length);
      assert.equal(tiles.find(tile => tile.mediaItemId === 10002)?.item.currentAuthorScore, 70);
      assert.equal(page.items.find(item => item.key === "rating-10004")?.mediaItemId, 10001);
      assert.equal(page.items.find(item => item.key === "review-10001")?.mediaItemId, 10001);
      assert.deepEqual(await getFeedMediaTiles([]), []);

      assert.deepEqual(await getFeedFriends(10001), [{ id: 10002, name: "Друг" }]);
      assert.deepEqual((await getFeedPage({ ...input, friendId: 10002 })).items, friendsPage.items);
      assert.equal((await getFeedPage({ ...input, friendId: 10003 })).items.length, 0);
      assert.equal((await getFeedPage({ mediaTypeCodes: ["game"], friendId: 10002 })).items.length, 0);

      assert.equal((await getFeedPage({ mediaTypeCodes: ["game"], friendsOnly: true })).items.length, 0);
      assert.equal((await getFeedPage({ ...input, authorId: 10003, friendsOnly: true })).items.length, 0);
      assert.deepEqual(page.items.filter(item => item.kind === "rating").map(item => item.score), [60, 80, 70]);
      assert.equal(page.items.find(item => item.key === "rating-10004")?.partLabel, "Сезон 1");
      assert.equal(page.items.find(item => item.key === "rating-10004")?.actorId, 10002);
      const awarded = page.items.filter(item => item.kind === "achievement" && item.actorId === 10002);
      assert.deepEqual(awarded.map(item => item.key), ["achievement-10002", "achievement-10001"]);
      assert.equal(awarded[0].href, "/users/10002/achievements");
      assert.equal(awarded[0].title, "Второй уровень");
      assert.equal(awarded[0].partLabel, "Ур. 2");
      assert.equal(awarded[1].imageUrl, "/achievement-images/achievements/10001/12345678-1234-4123-8123-123456789012.webp");
      await client!`update authors set is_discoverable=false where id=10003`;
      assert.equal((await getFeedPage(input)).items.find(item => item.key === "media-10001")?.actorId, null);
      await client!`update authors set is_discoverable=true where id=10003`;
      assert.equal(page.items.find(item => item.key === "media-10002")?.actorIsFriend, true);
      assert.equal(page.items.find(item => item.key === "media-10001")?.actorIsFriend, false);
      assert.equal(page.items.find(item => item.key === "rating-10001")?.cursor.at, "2026-02-01T00:00:00.000001Z");
      assert.ok(page.items.every(item => item.title !== "Фильм"));
      assert.ok((await getFeedPage({ ...input, mediaTypeCodes: [] })).items.every(item => item.kind === "series" || item.kind === "collection" || item.kind === "achievement"));
      const copiedCursor = page.items[0].cursor;
      const unprivileged = await getFeedPage({ mediaTypeCodes: ["game"], position: { direction: "older", cursor: copiedCursor } });
      assert.ok(unprivileged.items.every(item => item.kind !== "rating" && item.kind !== "wanted" && item.kind !== "achievement"));
      for (const authorId of [undefined, 10003]) {
        const other = await getFeedPage({ ...input, authorId });
        assert.ok(other.items.every(item => !["rating", "wanted", "achievement"].includes(item.kind) || item.actorId === authorId));
      }
    });
    await t.test("own activity includes wanted, ratings and awards without friends and remains private", async () => {
      await client!`insert into author_media_statuses(id,author_id,media_item_id,status,updated_at) values(10005,10001,10001,'wanted','2026-02-04')`;
      const mine = await getFeedPage({ ...input, mineOnly: true });
      assert.deepEqual(new Set(mine.items.map(item => item.key)), new Set(["rating-10003", "wanted-10005", "achievement-10004"]));
      assert.ok(mine.items.every(item => item.actorId === 10001 && !item.actorIsFriend));
      assert.ok((await getFeedPage(input)).items.some(item => item.key === "wanted-10005"));
      assert.equal((await getFeedMediaTiles(mine.items, input.authorId)).find(tile => tile.mediaItemId === 10001)?.currentAuthorStatus, "wanted");
      assert.ok((await getFeedPage({ ...input, friendsOnly: true })).items.every(item => item.actorId !== 10001));
      assert.equal((await getFeedPage({ mediaTypeCodes: ["game"], mineOnly: true })).items.length, 0);
      await client!`delete from author_media_statuses where id=10005`;
    });
    await t.test("live updated ordering, removals, friendship and publication checks", async () => {
      await client!`update ratings set score=100,updated_at='2026-03-01' where id=10001`;
      assert.equal((await getFeedPage(input)).items[0].key, "rating-10001");
      assert.equal((await getFeedPage(input)).items[0].score, 100);
      await client!`delete from ratings where id=10001`;
      await client!`delete from author_media_statuses where id=10001`;
      assert.ok((await getFeedPage(input)).items.every(item => item.key !== "rating-10001" && item.kind !== "wanted"));
      await client!`update authors set blocked_at=now() where id=10002`;
      assert.ok((await getFeedPage(input)).items.every(item => !["rating", "achievement"].includes(item.kind) || item.actorId === 10001));
      await client!`update authors set blocked_at=null,is_system=true where id=10002`;
      assert.ok((await getFeedPage(input)).items.every(item => !["rating", "achievement"].includes(item.kind) || item.actorId === 10001));
      await client!`update authors set is_system=false,is_discoverable=false where id=10002`;
      assert.ok((await getFeedPage(input)).items.some(item => item.kind === "rating" && item.actorId === 10002));
      await client!`update media_items set publication_status='private' where id=10001`;
      assert.ok((await getFeedPage(input)).items.every(item => (item.kind !== "rating" || item.actorId === 10001) && item.key !== "review-10001"));
      await client!`update media_items set publication_status='published' where id=10001`;
      await client!`delete from author_friendships`;
      assert.deepEqual(await getFeedFriends(10001), []);
      assert.ok((await getFeedPage({ ...input, mineOnly: true })).items.some(item => item.key === "rating-10003"));
      assert.equal((await getFeedPage({ ...input, friendId: 10002 })).items.length, 0);
      assert.ok((await getFeedPage(input)).items.every(item => !["rating", "achievement"].includes(item.kind) || item.actorId === 10001));
    });
    await t.test("equal timestamps and bidirectional cursor pages neither overlap nor lose rows", async () => {
      await client!`insert into author_friendships(first_author_id,second_author_id,requested_by_author_id,status,accepted_at) values(10001,10002,10001,'accepted',now())`;
      await client!`insert into media_items(id,code,title,media_type,created_by_author_id,created_at)
        select 11000+g,'feed-page-'||g,'Запись '||g,'game',10002,'2027-01-01'::timestamptz + ((g%3)::text||' microseconds')::interval from generate_series(1,165) g`;
      const first = await getFeedPage(input);
      const second = await getFeedPage({ ...input, position: { direction: "older", cursor: parseFeedCursor(first.older!)! } });
      assert.equal(first.items.length, FEED_PAGE_SIZE); assert.equal(second.items.length, FEED_PAGE_SIZE);
      const filteredFirst = await getFeedPage({ ...input, friendsOnly: true });
      const filteredSecond = await getFeedPage({ ...input, friendsOnly: true, position: { direction: "older", cursor: parseFeedCursor(filteredFirst.older!)! } });
      assert.equal(filteredSecond.items.length, FEED_PAGE_SIZE);
      assert.ok(filteredSecond.items.every(item => item.actorId === 10002 && !filteredFirst.items.some(firstItem => firstItem.key === item.key)));
      assert.ok(second.items.every(item => !first.items.some(other => other.key === item.key)));
      const back = await getFeedPage({ ...input, position: { direction: "newer", cursor: parseFeedCursor(second.newer!)! } });
      assert.deepEqual(back.items.map(item => item.key), first.items.map(item => item.key));
      assert.equal(back.newer, null);
      const keys = new Set<string>(); let page = first;
      for (let i = 0; i < 10; i++) {
        for (const item of page.items) { assert.ok(!keys.has(item.key)); keys.add(item.key); }
        if (!page.older) break;
        page = await getFeedPage({ ...input, position: { direction: "older", cursor: parseFeedCursor(page.older)! } });
      }
      assert.equal([...keys].filter(key => Number(key.split("-")[1]) > 11000).length, 165);
    });

    await t.test("series cover reads one row instead of its whole 10000-entry fanout", async () => {
      await client!.unsafe(`
        insert into media_items(id,code,title,media_type,created_at)
          select 200000+g,'fanout-entry-'||g,'Запись серии '||g,'game','2024-01-01' from generate_series(1,10000) g;
        insert into media_item_franchises(media_item_id,franchise_id,publication_status)
          select 200000+g,10001,'published' from generate_series(1,10000) g;
        update franchises set created_at='2030-01-01' where id=10001;
        analyze media_item_franchises; analyze media_items;
      `);
      const compiled = new PgDialect().sqlToQuery(buildFeedQuery({ mediaTypeCodes: ["game"] }));
      const [row] = await client!.unsafe("explain(analyze,buffers,format json) " + compiled.sql, compiled.params as never[]);
      const plan = row["QUERY PLAN"][0];
      const nodes: Record<string, unknown>[] = [];
      const walk = (node: Record<string, unknown>) => { nodes.push(node); for (const child of (node.Plans ?? []) as Record<string, unknown>[]) walk(child); };
      walk(plan.Plan);
      const coverScan = nodes.find(node => node["Relation Name"] === "media_item_franchises" && Number(node["Actual Loops"]) > 0);
      assert.ok(coverScan);
      assert.match(String(coverScan["Node Type"]), /Index/);
      assert.equal(coverScan["Actual Rows"], 1);
      assert.equal(coverScan["Actual Loops"], 1);
      t.diagnostic(JSON.stringify({ label: "series-10000", milliseconds: plan["Execution Time"], rows: coverScan["Actual Rows"], loops: coverScan["Actual Loops"], index: coverScan["Index Name"] }));
    });

    await t.test("friends-only news has an indexed author access path", async () => {
      const compiled = new PgDialect().sqlToQuery(buildFeedQuery({ ...input, friendsOnly: true }));
      const [row] = await client!.unsafe("explain(analyze,buffers,format json) " + compiled.sql, compiled.params as never[]);
      const nodes: Record<string, unknown>[] = [];
      const walk = (node: Record<string, unknown>) => { nodes.push(node); for (const child of (node.Plans ?? []) as Record<string, unknown>[]) walk(child); };
      walk(row["QUERY PLAN"][0].Plan);
      t.diagnostic(JSON.stringify(nodes.filter(node => node["Relation Name"] === "media_items").map(node => ({ index: node["Index Name"], condition: node["Index Cond"], rows: node["Actual Rows"], loops: node["Actual Loops"] }))));
      assert.ok(nodes.some(node => ["media_items_feed_author_created_idx", "media_items_created_by_author_id_idx"].includes(String(node["Index Name"])) && String(node["Index Cond"]).includes("created_by_author_id")));
      t.diagnostic(JSON.stringify({ label: "friends-only", milliseconds: row["QUERY PLAN"][0]["Execution Time"] }));
    });

    await t.test("award feed orders an indexed bounded prefix even when many grants share a timestamp", async () => {
      await client!.unsafe(`
        insert into achievement_levels(id,achievement_id,level,threshold,rarity)
          select 50000+g,10001,g+2,g+2,'common' from generate_series(1,10000) g;
        insert into user_achievements(id,author_id,achievement_level_id,award_group_id,awarded_at)
          select 50000+g,case when g<=5000 then 10002 else 10003 end,50000+g,gen_random_uuid(),'2040-01-01' from generate_series(1,10000) g;
        analyze achievement_levels; analyze user_achievements;
      `);
      const first = await getFeedPage({ ...input, friendsOnly: true });
      assert.equal(first.items.length,FEED_PAGE_SIZE);
      assert.ok(first.items.every(item => item.kind === "achievement" && item.actorId === 10002));
      const second = await getFeedPage({ ...input, friendsOnly: true, position: { direction: "older", cursor: parseFeedCursor(first.older!)! } });
      assert.ok(second.items.every(item => !first.items.some(other => other.key === item.key)));
      const back = await getFeedPage({ ...input, friendsOnly: true, position: { direction: "newer", cursor: parseFeedCursor(second.newer!)! } });
      assert.deepEqual(back.items.map(item => item.key), first.items.map(item => item.key));
      const compiled = new PgDialect().sqlToQuery(buildFeedQuery({ ...input, friendsOnly: true }));
      const [row] = await client!.unsafe("explain(analyze,buffers,format json) " + compiled.sql, compiled.params as never[]);
      const nodes: Record<string, unknown>[] = [];
      const walk = (node: Record<string, unknown>) => { nodes.push(node); for (const child of (node.Plans ?? []) as Record<string, unknown>[]) walk(child); };
      walk(row["QUERY PLAN"][0].Plan);
      const scan = nodes.find(node => node["Index Name"] === "user_achievements_author_awarded_at_idx");
      assert.ok(scan);
      assert.ok(Number(scan["Actual Rows"]) <= FEED_PAGE_SIZE + 1);
      t.diagnostic(JSON.stringify({ label: "friend-awards-10000", milliseconds: row["QUERY PLAN"][0]["Execution Time"], rows: scan["Actual Rows"], loops: scan["Actual Loops"] }));
    });

    await t.test("tier lists use first publication and public author visibility with own and friend filters", async () => {
      // Restore the friend after earlier visibility checks.
      await client!`update authors set blocked_at=null where id=10002`;
      await client!`update author_friendships set status='accepted' where first_author_id=10001 and second_author_id=10002`;
      const [list] = await client!`insert into tier_lists(author_id,title,status,first_published_at,configuration,distribution,client_creation_id)
        values(10002,'Тир-лист друга','published','2099-03-01',${JSON.stringify({ schemaVersion: 1, levels: [{ id: 's', name: 'S', color: '#ffffff' }] })}::jsonb,${JSON.stringify({ s: [] })}::jsonb,${randomUUID()}) returning id,public_id`;
      const key = `tier-list-${list.id}`;
      const first = (await getFeedPage({ ...input, friendsOnly: true })).items.find(item => item.key === key);
      assert.ok(first);
      assert.equal(first.href, `/tier-lists/${list.public_id}`);
      assert.equal(first.cursor.kind, 8);
      assert.ok((await getFeedPage({ mediaTypeCodes: [], publicOnly: true })).items.some(item => item.key === key));
      assert.ok(!(await getFeedPage({ ...input, mineOnly: true })).items.some(item => item.key === key));
      assert.ok((await getFeedPage({ ...input, authorId: 10002, mineOnly: true })).items.some(item => item.key === key));
      await client!`update tier_lists set title='Изменено',updated_at=now(),status='draft' where id=${list.id}`;
      assert.ok(!(await getFeedPage(input)).items.some(item => item.key === key));
      await client!`update tier_lists set status='published' where id=${list.id}`;
      assert.deepEqual((await getFeedPage(input)).items.find(item => item.key === key)?.cursor, first.cursor);
      await client!`update tier_lists set hidden_at=now() where id=${list.id}`;
      assert.ok(!(await getFeedPage(input)).items.some(item => item.key === key));
      await client!`update tier_lists set hidden_at=null where id=${list.id}`;
      await client!`update authors set blocked_at=now() where id=10002`;
      assert.ok(!(await getFeedPage({ mediaTypeCodes: [], publicOnly: true })).items.some(item => item.key === key));
      await client!`update authors set blocked_at=null where id=10002`;
      const compiled = new PgDialect().sqlToQuery(buildFeedQuery({ ...input, friendsOnly: true }));
      const plan = await client!.unsafe("explain(analyze,buffers,format json) " + compiled.sql, compiled.params as never[]);
      const nodes: Record<string, unknown>[] = [];
      const walk = (node: Record<string, unknown>) => { nodes.push(node); for (const child of (node.Plans ?? []) as Record<string, unknown>[]) walk(child); };
      const result = plan[0]["QUERY PLAN"][0];
      walk(result.Plan);
      t.diagnostic(JSON.stringify({ label: 'tier-list', milliseconds: result["Execution Time"],
        nodes: nodes.filter(node => node["Relation Name"] === 'tier_lists').map(node => ({ type: node["Node Type"], index: node["Index Name"], rows: node["Actual Rows"], loops: node["Actual Loops"] })) }));
      await client!`delete from tier_lists where id=${list.id}`;
    });

    await t.test("representative SQL plans", { skip: process.env.FEED_TEST_SCALE !== "1", timeout: 540000 }, async () => {
      await client!.unsafe(`
        insert into authors(id,code,name,access_profile_id) select 20000+g,'scale-author-'||g,'Автор '||g,2 from generate_series(1,1000) g;
        insert into media_items(id,code,title,media_type,publication_status,created_at)
          select 20000+g,'scale-entry-'||g,'Запись '||g,case when g%10=0 then 'film' else 'game' end,
          case when g%20=0 then 'private'::publication_status else 'published'::publication_status end,
          '2025-01-01'::timestamptz + g*interval '1 second' from generate_series(1,100000) g;
        alter table ratings disable trigger user;
        insert into ratings(id,author_id,media_item_id,score,updated_at)
          select 20000+(a-1)*1000+l,20000+a,20001+((a*97+l*17)%100000),80,
          '2026-11-01'::timestamptz - ((a*300+l)%100000)*interval '1 second'
          from generate_series(1,1000) a cross join generate_series(1,1000) l;
        alter table ratings enable trigger user;
        insert into author_media_statuses(id,author_id,media_item_id,status,updated_at)
          select 20000+(a-1)*500+l,20000+a,20001+((a*97+l*17+50000)%100000),'wanted',
          '2026-11-01'::timestamptz - ((a*300+l)%100000)*interval '1 second'
          from generate_series(1,1000) a cross join generate_series(1,500) l;
        insert into author_friendships(first_author_id,second_author_id,requested_by_author_id,status,accepted_at)
          select 10001,20000+g,10001,'accepted',now() from generate_series(1,500) g;
        insert into author_friendships(first_author_id,second_author_id,requested_by_author_id,status,accepted_at)
          select 10003,20000+g,10003,'accepted',now() from generate_series(1,10) g;
        analyze;
      `);
      for (const [label, authorId, position] of [
        ["guest", undefined, undefined], ["zero-friends", 10002, undefined], ["10-friends", 10003, undefined], ["500-friends", 10001, undefined],
        ["deep-500", 10001, { direction: "older" as const, cursor: { at: "2026-10-31T12:00:00.000000Z", kind: 5, id: 500000 } }],
      ] as const) {
        const compiled = new PgDialect().sqlToQuery(buildFeedQuery({ mediaTypeCodes: ["game"], authorId, position }));
        const [row] = await client!.unsafe("explain(analyze,buffers,format json) " + compiled.sql, compiled.params as never[]);
        const plan = row["QUERY PLAN"][0];
        const nodes: Record<string, unknown>[] = [];
        const walk = (node: Record<string, unknown>) => { nodes.push(node); for (const child of (node.Plans ?? []) as Record<string, unknown>[]) walk(child); };
        walk(plan.Plan);
        assert.ok(!nodes.some(node => node["Node Type"] === "Seq Scan" && ["ratings", "author_media_statuses"].includes(String(node["Relation Name"]))), "personal sources must use author-scoped access");
        const candidateNode = nodes.find(node => node["Subplan Name"] === "CTE candidates");
        assert.ok(Number(candidateNode?.["Actual Rows"]) <= FEED_PAGE_SIZE + 1);
        t.diagnostic(JSON.stringify({ label, milliseconds: plan["Execution Time"], sharedHit: plan.Plan["Shared Hit Blocks"], sharedRead: plan.Plan["Shared Read Blocks"],
          nodes: nodes.filter(node => node["Index Name"] || node["Node Type"] === "Sort").map(node => ({ type: node["Node Type"], index: node["Index Name"], rows: node["Actual Rows"], loops: node["Actual Loops"], removed: node["Rows Removed by Filter"], sort: node["Sort Method"] })) }));
      }
    });
  } finally {
    await closeApp?.(); await client?.end();
    await admin.unsafe(`drop database if exists "${name}"`); await admin.end();
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
  }
});
