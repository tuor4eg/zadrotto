import assert from "node:assert/strict";
import { test } from "node:test";

const databaseUrl = process.env.MANGAUPDATES_TEST_DATABASE_URL;
test("MangaUpdates creator identities share roles and preserve manual and excluded decisions", { skip: !databaseUrl }, async () => {
  process.env.DATABASE_URL = databaseUrl!;
  const { db, getDbClient } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const { syncMangaUpdatesCreators } = await import("../src/db/queries/mangaupdates-creators");
  const rollback = new Error("rollback fixture");
  try {
    await assert.rejects(db.transaction(async tx => {
      const [entry] = await tx.execute<{ id: number }>(sql`insert into media_items(code,title,media_type) values ('mangaupdates-creator-test','Manga','manga') returning id`);
      const [creator] = await tx.execute<{ id: number }>(sql`insert into creators(name,slug,type_id) select 'Creator MU fixture','mu-creator-fixture',id from creator_types where code='person' returning id`);
      const [publisher] = await tx.execute<{ id: number }>(sql`insert into creators(name,slug,type_id) select 'Publisher MU fixture','mu-publisher-fixture',id from creator_types where code='organization' returning id`);
      await tx.execute(sql`insert into provider_creator_bindings(provider,external_creator_id,creator_id) values ('mangaupdates','person:900001',${creator.id}),('mangaupdates','publisher:900001',${publisher.id})`);
      const refs = [
        { externalId: "person:900001", name: "Creator MU fixture", roleCode: "writer" as const, position: 0 },
        { externalId: "person:900001", name: "Creator MU fixture", roleCode: "artist" as const, position: 0 },
        { externalId: "publisher:900001", name: "Publisher MU fixture", roleCode: "publisher" as const, position: 0 },
      ];
      const linkedRoles = async () => (await tx.execute<{ code: string }>(sql`select r.code from entry_creators e join creator_roles r on r.id=e.role_id where e.entry_id=${entry.id} order by r.code`)).map(row => row.code);
      await syncMangaUpdatesCreators(tx, entry.id, refs);
      assert.deepEqual(await linkedRoles(), ["artist", "publisher", "writer"]);
      const [counts] = await tx.execute<{ n: number }>(sql`select count(*)::int n from creator_requests where provider='mangaupdates' and external_creator_id in ('person:900001','publisher:900001')`);
      assert.equal(counts.n, 2);
      await syncMangaUpdatesCreators(tx, entry.id, refs);
      assert.deepEqual(await linkedRoles(), ["artist", "publisher", "writer"]);
      await tx.execute(sql`update creator_requests set decision=null,manually_reopened=true where provider='mangaupdates' and external_creator_id='person:900001'`);
      await syncMangaUpdatesCreators(tx, entry.id, refs);
      assert.deepEqual(await linkedRoles(), ["publisher"]);
      await tx.execute(sql`insert into provider_creator_exclusions(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name) values ('mangaupdates','manga','publisher:900001','Publisher MU fixture','publisher mu fixture')`);
      await syncMangaUpdatesCreators(tx, entry.id, refs);
      assert.deepEqual(await linkedRoles(), []);
      await syncMangaUpdatesCreators(tx, entry.id, []);
      const [occurrences] = await tx.execute<{ n: number }>(sql`select count(*)::int n from creator_request_media_items where media_item_id=${entry.id}`);
      assert.equal(occurrences.n, 0);
      throw rollback;
    }), error => error === rollback);
  } finally {
    await getDbClient().end();
  }
});
