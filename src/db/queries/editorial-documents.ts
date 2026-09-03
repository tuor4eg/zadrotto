import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { editorialDocumentBlocks, mediaItems } from "@/db/schema";
import {
  MAX_EDITORIAL_DOCUMENT_BLOCKS,
  MAX_EDITORIAL_DOCUMENT_MEDIA_BLOCKS,
  MAX_EDITORIAL_HEADING_LENGTH,
  MAX_EDITORIAL_MEDIA_COMMENT_LENGTH,
  MAX_EDITORIAL_TEXT_LENGTH,
  type EditorialDocumentBlockInput,
} from "@/lib/editorial-documents/model";

export function assertEditorialDocumentBlocks(blocks: EditorialDocumentBlockInput[]) {
  if (blocks.length > MAX_EDITORIAL_DOCUMENT_BLOCKS) throw new Error("blocks-limit");
  const mediaBlocks = blocks.filter((block) => block.type === "media");
  if (mediaBlocks.length > MAX_EDITORIAL_DOCUMENT_MEDIA_BLOCKS) throw new Error("media-blocks-limit");
  const mediaIds = mediaBlocks.map((block) => block.mediaItemId);
  if (
    new Set(mediaIds).size !== mediaIds.length
    || mediaIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  ) throw new Error("blocks-invalid");

  for (const block of blocks) {
    if (block.type === "media" && (block.editorialComment?.length ?? 0) > MAX_EDITORIAL_MEDIA_COMMENT_LENGTH) {
      throw new Error("comment-length");
    }
    if (block.type === "heading") {
      if (!block.content.trim()) throw new Error("heading-empty");
      if (block.content.length > MAX_EDITORIAL_HEADING_LENGTH) throw new Error("heading-length");
    }
    if (block.type === "text") {
      if (!block.content.trim()) throw new Error("text-empty");
      if (block.content.length > MAX_EDITORIAL_TEXT_LENGTH) throw new Error("text-length");
    }
  }
}

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
  assertEditorialDocumentBlocks(blocks);
  await tx.execute(sql`select pg_advisory_xact_lock(6431, ${documentId})`);
  await assertPublishedMediaItems(
    tx,
    blocks.flatMap((block) => block.type === "media" ? [block.mediaItemId] : []),
  );
  await tx.delete(editorialDocumentBlocks).where(eq(editorialDocumentBlocks.documentId, documentId));
  if (blocks.length) {
    await tx.insert(editorialDocumentBlocks).values(blocks.map((block, position) => ({
      documentId,
      position,
      blockType: block.type,
      mediaItemId: block.type === "media" ? block.mediaItemId : null,
      content: block.type === "media"
        ? block.editorialComment?.trim() || null
        : block.content.trim(),
    })));
  }
}

export async function getEditorialDocumentBlocks(documentId: number) {
  return db.select({
    id: editorialDocumentBlocks.id,
    position: editorialDocumentBlocks.position,
    type: editorialDocumentBlocks.blockType,
    mediaItemId: editorialDocumentBlocks.mediaItemId,
    content: editorialDocumentBlocks.content,
  }).from(editorialDocumentBlocks)
    .where(eq(editorialDocumentBlocks.documentId, documentId))
    .orderBy(asc(editorialDocumentBlocks.position));
}
