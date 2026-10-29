import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const url = process.env.COMIC_VINE_TEST_DATABASE_URL;
test("screenwriter migration preserves comic provenance, manual flags, requests and book writers", { skip: !url }, async () => {
  const { default: postgres } = await import("postgres");
  const client = postgres(url!, { max: 1, prepare: false });
  const migration = (await readFile("drizzle/0152_comic_screenwriter.sql", "utf8")).replaceAll("--> statement-breakpoint", "");
  try {
    await assert.rejects(client.begin(async tx => {
      const [comic] = await tx`insert into media_items(code,title,media_type) values ('migration-comic-test','Comic','comic') returning id`;
      const [book] = await tx`insert into media_items(code,title,media_type) values ('migration-book-test','Book','book') returning id`;
      const [creator] = await tx`insert into creators(name,slug,type_id) select 'Migration Creator','migration-test',id from creator_types where code='person' returning id`;
      const [roles] = await tx`select (select id from creator_roles where code='writer') as writer, (select id from creator_roles where code='screenwriter') as screenwriter`;
      await tx`insert into entry_creators(entry_id,creator_id,role_id,is_manual) values (${comic.id},${creator.id},${roles.writer},true),(${comic.id},${creator.id},${roles.screenwriter},false),(${book.id},${creator.id},${roles.writer},true)`;
      await tx`insert into entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name) values (${comic.id},${creator.id},${roles.writer},'comic-vine','comic-vine:person:777')`;
      const [request] = await tx`insert into creator_requests(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name) values ('comic-vine','comic','person:777','Migration Creator','migration creator') returning id`;
      await tx`insert into creator_request_media_items(request_id,media_item_id,role_id,external_creator_name) values (${request.id},${comic.id},${roles.writer},'Migration Creator')`;
      await tx`insert into media_item_metadata(media_item_id,facts) values (${comic.id},${tx.json({ comicVinePersonCreators: [{ roleCode: "writer", name: "Migration Creator" }, { roleCode: "artist", name: "Migration Creator" }] })})`;
      await tx.unsafe(migration);
      const comicRoles = await tx`select r.code, e.is_manual from entry_creators e join creator_roles r on r.id=e.role_id where e.entry_id=${comic.id}`;
      assert.deepEqual(comicRoles.map(row => [row.code, row.is_manual]), [["screenwriter", true]]);
      const [source] = await tx`select r.code from entry_creator_sources s join creator_roles r on r.id=s.role_id where s.entry_id=${comic.id}`;
      assert.equal(source.code, "screenwriter");
      const [occurrence] = await tx`select r.code from creator_request_media_items o join creator_roles r on r.id=o.role_id where o.request_id=${request.id}`;
      assert.equal(occurrence.code, "screenwriter");
      const [bookRole] = await tx`select r.code from entry_creators e join creator_roles r on r.id=e.role_id where e.entry_id=${book.id}`;
      assert.equal(bookRole.code, "writer");
      const [metadata] = await tx`select facts from media_item_metadata where media_item_id=${comic.id}`;
      assert.deepEqual(metadata.facts.comicVinePersonCreators.map((row: {roleCode:string}) => row.roleCode), ["screenwriter", "artist"]);
      throw new Error("ROLLBACK_FIXTURE");
    }), /ROLLBACK_FIXTURE/);
  } finally { await client.end(); }
});
