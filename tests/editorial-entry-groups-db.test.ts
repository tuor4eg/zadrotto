import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Use a migrated, disposable PostgreSQL database. Run tsx with
// NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server.
const testUrl = process.env.EDITORIAL_COLLECTIONS_TEST_DATABASE_URL;

test("entry groups preserve ordered documents, counts and publication integrity", { skip: !testUrl }, async () => {
  process.env.DATABASE_URL = testUrl;
  const { db, getDbClient } = await import("../src/db");
  const { eq, inArray, sql } = await import("drizzle-orm");
  const { adminUsers, editorialDocuments, editorialDocumentBlockItems, editorialDocumentBlocks, mediaItems } = await import("../src/db/schema");
  const {
    createEditorialCollection, updateEditorialCollection, deleteEditorialCollection,
    getEditorialCollectionById, getAdminEditorialCollections, getPublishedEditorialCollections,
    setEditorialCollectionPublicationStatus, getMediaItemCollectionReferences,
  } = await import("../src/db/queries/editorial-collections");
  const { getEditorialDocumentBlocks } = await import("../src/db/queries/editorial-documents");
  const { updateAdminMediaItemPublicationStatus, deleteAdminUnpublishedMediaItemWithRelatedData } = await import("../src/db/queries/media-items");
  const { getLatestArchiveFeed } = await import("../src/db/queries/archive-feed");
  const client = getDbClient();
  const key = `entry-group-test-${Date.now()}`;
  let adminId: number | undefined;
  const itemIds: number[] = [];
  const documentIds: number[] = [];
  try {
    const [admin] = await db.insert(adminUsers).values({ login: key, passwordHash: "test-only" }).returning();
    adminId = admin.id;
    const items = await db.insert(mediaItems).values(["film", "series", "book", "game"].map((mediaType, index) => ({
      code: `${key}-${index}`, title: `Запись ${index}`, mediaType,
      publicationStatus: index === 3 ? "private" as const : "published" as const,
    }))).returning();
    itemIds.push(...items.map((item) => item.id));
    const [film, series, book, draft] = items;
    const base = { adminId, title: key, description: null, coverObjectKey: null };
    const collection = await createEditorialCollection({ ...base, blocks: [
      { type: "heading", content: "Раздел" },
      { type: "media", mediaItemId: book.id, editorialComment: "Комментарий" },
      { type: "entry_group", title: null, description: null, mediaItemIds: [series.id, film.id] },
      { type: "text", content: "После набора" },
    ] });
    documentIds.push(collection.documentId);
    const loaded = (await getEditorialCollectionById(collection.id))!;
    assert.deepEqual(loaded.blocks.map((block) => block.type), ["heading", "media", "entry_group", "text"]);
    const group = loaded.blocks[2];
    assert.equal(group.type, "entry_group");
    if (group.type !== "entry_group") throw new Error("Expected group");
    assert.equal(group.title, null);
    assert.equal(group.description, null);
    assert.deepEqual(group.items.map((entry) => entry.item.id), [series.id, film.id]);
    assert.equal((await getAdminEditorialCollections()).find((row) => row.id === collection.id)!.itemsCount, 3);
    assert.deepEqual((await getMediaItemCollectionReferences(series.id)).map((row) => row.id), [collection.id]);
    const before = await getEditorialDocumentBlocks(collection.documentId);
    await assert.rejects(updateEditorialCollection(collection.id, { ...base, blocks: [
      { type: "entry_group", title: null, description: null, mediaItemIds: [draft.id] },
    ] }), /items-unpublished/);
    assert.deepEqual(await getEditorialDocumentBlocks(collection.documentId), before);
    await assert.rejects(updateEditorialCollection(collection.id, { ...base, blocks: [
      { type: "media", mediaItemId: film.id, editorialComment: null },
      { type: "entry_group", title: null, description: null, mediaItemIds: [film.id] },
    ] }), /blocks-invalid/);
    await assert.rejects(db.transaction(async (tx) => {
      await tx.delete(editorialDocumentBlocks).where(eq(editorialDocumentBlocks.documentId, collection.documentId));
      await tx.insert(editorialDocumentBlocks).values({ documentId: collection.documentId, position: 0, blockType: "text", content: "" });
    }));
    assert.deepEqual(await getEditorialDocumentBlocks(collection.documentId), before);

    await updateEditorialCollection(collection.id, { ...base, blocks: [
      { type: "entry_group", title: "  Вечер  ", description: "  Описание  ", mediaItemIds: [film.id, series.id] },
    ] });
    const reordered = (await getEditorialCollectionById(collection.id))!.blocks[0];
    assert.equal(reordered.type, "entry_group");
    if (reordered.type !== "entry_group") throw new Error("Expected group");
    assert.equal(reordered.title, "Вечер");
    assert.equal(reordered.description, "Описание");
    assert.deepEqual(reordered.items.map((entry) => entry.mediaItemId), [film.id, series.id]);
    await setEditorialCollectionPublicationStatus(collection.id, "published", adminId);
    assert.equal((await getPublishedEditorialCollections()).find((row) => row.id === collection.id)!.itemsCount, 2);
    assert.equal((await getLatestArchiveFeed([{ code: "film", name: "Фильм" }])).find((row) => row.href === `/collections/${collection.slug}`)!.meta, "2 записей");
    await assert.rejects(updateAdminMediaItemPublicationStatus({ mediaItemId: film.id, nextStatus: "private" }), /collection-reference/);
    await assert.rejects(client.unsafe("DELETE FROM media_items WHERE id = $1", [film.id]), /foreign key/);
    // Simulate an external status change: both publication and deletion must still detect group references.
    await db.update(mediaItems).set({ publicationStatus: "private" }).where(eq(mediaItems.id, film.id));
    await assert.rejects(setEditorialCollectionPublicationStatus(collection.id, "published", adminId), /items-unpublished/);
    await assert.rejects(deleteAdminUnpublishedMediaItemWithRelatedData(film.id), /collection-reference/);
    await db.update(mediaItems).set({ publicationStatus: "published" }).where(eq(mediaItems.id, film.id));
    await assert.rejects(db.insert(editorialDocumentBlockItems).values({ blockId: reordered.id, mediaItemId: book.id, position: 0 }));
    await assert.rejects(db.insert(editorialDocumentBlockItems).values({ blockId: reordered.id, mediaItemId: book.id, position: -1 }));
    const oldBlockIds = before.map((block) => block.id);
    assert.equal((await db.select().from(editorialDocumentBlockItems).where(inArray(editorialDocumentBlockItems.blockId, oldBlockIds))).length, 0);
    await deleteEditorialCollection(collection.id);
    assert.equal((await db.select().from(editorialDocumentBlockItems).where(eq(editorialDocumentBlockItems.blockId, reordered.id))).length, 0);
    assert.deepEqual(await getMediaItemCollectionReferences(film.id), []);
    const empty = await createEditorialCollection({ ...base, title: `${key}-empty`, blocks: [{ type: "text", content: "Текст" }] });
    documentIds.push(empty.documentId);
    await assert.rejects(setEditorialCollectionPublicationStatus(empty.id, "published", adminId), /empty/);

    // Upgrade a populated old document using the real migration SQL, in one transaction.
    const schema = `entry_group_upgrade_${Date.now()}`;
    await client.unsafe(`CREATE SCHEMA "${schema}"`);
    try {
      await client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${schema}";`);
        await tx.unsafe(`
          CREATE TYPE "${schema}"."editorial_document_block_type" AS ENUM ('media', 'heading', 'text');
          CREATE TABLE media_items (id integer PRIMARY KEY);
          INSERT INTO media_items VALUES (1), (2);
          CREATE TABLE editorial_document_blocks (
            id serial PRIMARY KEY, document_id integer NOT NULL, position integer NOT NULL,
            block_type "${schema}"."editorial_document_block_type" NOT NULL,
            media_item_id integer, content text,
            CONSTRAINT editorial_document_blocks_shape_check CHECK (block_type::text IN ('media','heading','text'))
          );
          INSERT INTO editorial_document_blocks(document_id,position,block_type,media_item_id,content)
            VALUES (1,0,'heading',NULL,'Раздел'),(1,1,'media',1,'Комментарий'),(1,2,'text',NULL,'Текст');
        `);
        for (const file of ["0110_editorial_entry_group_type.sql", "0111_editorial_entry_groups.sql"]) {
          const migration = readFileSync(`drizzle/${file}`, "utf8").replace('"public"."editorial_document_block_type"', `"${schema}"."editorial_document_block_type"`);
          for (const statement of migration.split("--> statement-breakpoint")) await tx.unsafe(statement);
        }
      });
      const oldRows = await client.unsafe(`SELECT position, block_type::text, media_item_id, content, title FROM "${schema}".editorial_document_blocks ORDER BY position`);
      assert.deepEqual(oldRows.map((row) => [row.position, row.block_type, row.media_item_id, row.content, row.title]), [
        [0, "heading", null, "Раздел", null], [1, "media", 1, "Комментарий", null], [2, "text", null, "Текст", null],
      ]);
      await client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${schema}";`);
        await tx.unsafe("INSERT INTO editorial_document_blocks(document_id,position,block_type) VALUES (1,3,'entry_group')");
        await tx.unsafe("INSERT INTO editorial_document_block_items VALUES (4,2,0)");
        await tx.unsafe("DELETE FROM editorial_document_blocks WHERE id=4");
        const rows = await tx.unsafe("SELECT * FROM editorial_document_block_items");
        assert.equal(rows.length, 0);
      });
    } finally { await client.unsafe(`DROP SCHEMA "${schema}" CASCADE`); }
    assert.equal((await db.execute(sql`select 1`)).length, 1);
  } finally {
    if (documentIds.length) await db.delete(editorialDocuments).where(inArray(editorialDocuments.id, documentIds));
    if (itemIds.length) await db.delete(mediaItems).where(inArray(mediaItems.id, itemIds));
    if (adminId) await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
    await client.end();
  }
});
