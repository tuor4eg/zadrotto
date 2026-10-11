import assert from "node:assert/strict";
import { test } from "node:test";

const testUrl = process.env.EDITORIAL_COLLECTIONS_TEST_DATABASE_URL;
test("collection settings persist, enforce database constraints and protect existing content on limit errors", { skip: !testUrl }, async () => {
  process.env.DATABASE_URL = testUrl;
  const { db, getDbClient } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const { getCollectionSettings, saveCollectionSettings } = await import("../src/db/queries/collection-settings");
  const { createEditorialCollection, updateEditorialCollection } = await import("../src/db/queries/editorial-collections");
  const { getEditorialDocumentBlocks } = await import("../src/db/queries/editorial-documents");
  const { adminUsers, mediaItems, editorialDocuments, editorialDocumentBlocks, editorialDocumentBlockItems } = await import("../src/db/schema");
  const initial = await getCollectionSettings();
  try {
    const [admin] = await db.insert(adminUsers).values({ login: `settings-test-${Date.now()}`, passwordHash: "test" }).returning();
    await saveCollectionSettings({ maxBlocks: 301, maxEntries: 250, updatedByAdminId: admin.id });
    assert.deepEqual(await getCollectionSettings(), { maxBlocks: 301, maxEntries: 250 });
    const base = { adminId: admin.id, title: "Настройки", description: null, coverObjectKey: null };
    const blocks = Array.from({ length: 301 }, () => ({ type: "text" as const, content: "Текст" }));
    const collection = await createEditorialCollection({ ...base, blocks });
    const before = await getEditorialDocumentBlocks(collection.documentId);
    assert.equal(before.length, 301);
    await saveCollectionSettings({ maxBlocks: 2, maxEntries: 1, updatedByAdminId: admin.id });
    await assert.rejects(updateEditorialCollection(collection.id, { ...base, blocks }), /blocks-limit:2/);
    assert.deepEqual(await getEditorialDocumentBlocks(collection.documentId), before);
    await updateEditorialCollection(collection.id, { ...base, blocks: blocks.slice(0, 2) });
    assert.equal((await getEditorialDocumentBlocks(collection.documentId)).length, 2);
    await assert.rejects(db.transaction(async (tx) => {
      const records = await tx.insert(mediaItems).values([1, 2].map((number) => ({ code: `limit-${admin.id}-${number}`, title: "Запись", mediaType: "film", publicationStatus: "published" as const }))).returning();
      const [document] = await tx.insert(editorialDocuments).values({ kind: "collection" }).returning();
      const [block] = await tx.insert(editorialDocumentBlocks).values({ documentId: document.id, position: 0, blockType: "entry_group" }).returning();
      await tx.insert(editorialDocumentBlockItems).values(records.map((record, position) => ({ blockId: block.id, mediaItemId: record.id, position })));
    }), /media-blocks-limit:1/);
    await assert.rejects(getDbClient().unsafe("update collection_settings set max_entries = 0"), /collection_settings_max_entries_check/);
    await assert.rejects(getDbClient().unsafe("insert into collection_settings (id) values (2)"), /collection_settings_singleton_id_check/);
    await db.execute(sql`delete from editorial_collections where id = ${collection.id}`);
    await db.execute(sql`delete from editorial_documents where id = ${collection.documentId}`);
    await db.execute(sql`delete from admin_users where id = ${admin.id}`);
  } finally {
    await db.execute(sql`update collection_settings set max_blocks = ${initial.maxBlocks}, max_entries = ${initial.maxEntries}, updated_by_admin_id = null where id = 1`);
    await getDbClient().end();
  }
});
