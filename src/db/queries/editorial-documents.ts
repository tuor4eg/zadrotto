import { asc, eq, inArray, sql } from "drizzle-orm";

import { getCollectionSettings } from "@/db/queries/collection-settings";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { editorialDocumentBlockItems, editorialDocumentBlocks, mediaItems } from "@/db/schema";
import {
  assertEditorialDocumentBlocks,
  getEditorialDocumentMediaIds,
  type EditorialDocumentBlockInput,
} from "@/lib/editorial-documents/model";

export { assertEditorialDocumentBlocks } from "@/lib/editorial-documents/model";

async function assertPublishedMediaItems(tx: DbTransaction, mediaItemIds: number[]) {
  if (mediaItemIds.length === 0) return;
  const rows = await tx.select({
    id: mediaItems.id,
    title: mediaItems.title,
    publicationStatus: mediaItems.publicationStatus,
  }).from(mediaItems).where(inArray(mediaItems.id, mediaItemIds)).for("update");
  const validIds = new Set(rows.filter((row) => row.publicationStatus === "published").map((row) => row.id));
  if (validIds.size !== mediaItemIds.length) {
    const invalid = rows.filter((row) => !validIds.has(row.id)).map((row) => row.title);
    throw new Error(`items-unpublished:${invalid.join(", ")}`);
  }
}

export async function replaceEditorialDocumentBlocks(
  tx: DbTransaction,
  documentId: number,
  blocks: EditorialDocumentBlockInput[],
) {
  assertEditorialDocumentBlocks(blocks, await getCollectionSettings(tx));
  await tx.execute(sql`select pg_advisory_xact_lock(6431, ${documentId})`);
  await assertPublishedMediaItems(
    tx,
    getEditorialDocumentMediaIds(blocks),
  );
  await tx.delete(editorialDocumentBlocks).where(eq(editorialDocumentBlocks.documentId, documentId));
  if (blocks.length) {
    const inserted = await tx.insert(editorialDocumentBlocks).values(blocks.map((block, position) => ({
      documentId,
      position,
      blockType: block.type,
      mediaItemId: block.type === "media" ? block.mediaItemId : null,
      title: block.type === "entry_group" ? block.title?.trim() || null : null,
      content: block.type === "entry_group" ? block.description?.trim() || null : block.type === "media"
        ? block.editorialComment?.trim() || null
        : block.content.trim(),
    }))).returning({ id: editorialDocumentBlocks.id, position: editorialDocumentBlocks.position });
    const blockIdByPosition = new Map(inserted.map((block) => [block.position, block.id]));
    const items = blocks.flatMap((block, blockPosition) => block.type === "entry_group"
      ? block.mediaItemIds.map((mediaItemId, position) => ({
          blockId: blockIdByPosition.get(blockPosition)!, mediaItemId, position,
        }))
      : []);
    if (items.length) await tx.insert(editorialDocumentBlockItems).values(items);
  }
}

export async function getEditorialDocumentBlocks(documentId: number) {
  const blocks = await db.select({
    id: editorialDocumentBlocks.id,
    position: editorialDocumentBlocks.position,
    type: editorialDocumentBlocks.blockType,
    mediaItemId: editorialDocumentBlocks.mediaItemId,
    title: editorialDocumentBlocks.title,
    content: editorialDocumentBlocks.content,
  }).from(editorialDocumentBlocks)
    .where(eq(editorialDocumentBlocks.documentId, documentId))
    .orderBy(asc(editorialDocumentBlocks.position));
  const groupIds = blocks.filter((block) => block.type === "entry_group").map((block) => block.id);
  const items = groupIds.length ? await db.select().from(editorialDocumentBlockItems)
    .where(inArray(editorialDocumentBlockItems.blockId, groupIds))
    .orderBy(asc(editorialDocumentBlockItems.position)) : [];
  const idsByBlock = new Map<number, number[]>();
  for (const item of items) {
    const ids = idsByBlock.get(item.blockId) ?? [];
    ids.push(item.mediaItemId);
    idsByBlock.set(item.blockId, ids);
  }
  return blocks.map((block) => ({ ...block, mediaItemIds: idsByBlock.get(block.id) ?? [] }));
}
