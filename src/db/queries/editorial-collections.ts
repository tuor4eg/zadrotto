import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import {
  authorMediaStatuses,
  editorialCollections,
  editorialDocumentBlocks,
  editorialDocuments,
  mediaItems,
} from "@/db/schema";
import {
  assertEditorialDocumentBlocks,
  getEditorialDocumentBlocks,
  replaceEditorialDocumentBlocks,
} from "@/db/queries/editorial-documents";
import type { EditorialDocumentBlockInput } from "@/lib/editorial-documents/model";
import type { AuthorMediaStatus } from "@/lib/media/author-media-status";
import { slugifyCodePart } from "@/lib/common/generated-code";
import { resolveCollectionImageUrl } from "@/lib/collections/images";

export const MAX_COLLECTION_DESCRIPTION_LENGTH = 10_000;

export type EditorialCollectionWriteInput = {
  title: string;
  description: string | null;
  coverObjectKey: string | null;
  blocks: EditorialDocumentBlockInput[];
};

type EditorialCollectionMediaTile = Awaited<ReturnType<typeof getMediaItemTilesByIds>>[number];
export type HydratedEditorialCollectionBlock =
  | { id: number; position: number; type: "heading" | "text"; content: string }
  | {
      id: number;
      position: number;
      type: "media";
      mediaItemId: number;
      editorialComment: string | null;
      item: EditorialCollectionMediaTile;
      currentAuthorStatus: AuthorMediaStatus | null;
    };

function assertCollectionInput(input: EditorialCollectionWriteInput) {
  if (!input.title.trim()) throw new Error("title");
  if (input.description && input.description.length > MAX_COLLECTION_DESCRIPTION_LENGTH) {
    throw new Error("description-length");
  }
  assertEditorialDocumentBlocks(input.blocks);
}

async function createUniqueSlug(
  tx: DbTransaction,
  title: string,
) {
  const base = slugifyCodePart(title);
  const rows = await tx
    .select({ slug: editorialCollections.slug })
    .from(editorialCollections)
    .where(sql`${editorialCollections.slug} = ${base} or ${editorialCollections.slug} like ${`${base}-%`}`);
  const used = new Set(rows.map((row) => row.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export async function createEditorialCollection(
  input: EditorialCollectionWriteInput & { adminId: number },
) {
  assertCollectionInput(input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(64300001)`);
    const slug = await createUniqueSlug(tx, input.title);
    const [document] = await tx.insert(editorialDocuments).values({ kind: "collection" }).returning();
    const [collection] = await tx.insert(editorialCollections).values({
      documentId: document!.id,
      title: input.title.trim(),
      slug,
      description: input.description?.trim() || null,
      coverObjectKey: input.coverObjectKey,
      createdByAdminId: input.adminId,
      updatedByAdminId: input.adminId,
    }).returning();
    await replaceEditorialDocumentBlocks(tx, document!.id, input.blocks);
    return collection!;
  });
}

export async function updateEditorialCollection(
  id: number,
  input: EditorialCollectionWriteInput & { adminId: number },
) {
  assertCollectionInput(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(editorialCollections)
      .where(eq(editorialCollections.id, id)).limit(1).for("update");
    if (!existing) return null;
    await replaceEditorialDocumentBlocks(tx, existing.documentId, input.blocks);
    const [updated] = await tx.update(editorialCollections).set({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      coverObjectKey: input.coverObjectKey,
      updatedByAdminId: input.adminId,
      updatedAt: new Date(),
    }).where(eq(editorialCollections.id, id)).returning();
    return updated ?? null;
  });
}

export async function setEditorialCollectionPublicationStatus(
  id: number,
  status: "private" | "published",
  adminId: number,
) {
  return db.transaction(async (tx) => {
    const [collection] = await tx.select({
      id: editorialCollections.id,
      documentId: editorialCollections.documentId,
    })
      .from(editorialCollections).where(eq(editorialCollections.id, id)).limit(1).for("update");
    if (!collection) return null;
    if (status === "published") {
      const [{ publishedCount, totalCount }] = await tx.select({
        publishedCount: sql<number>`count(*) filter (where ${mediaItems.publicationStatus} = 'published')::int`,
        totalCount: sql<number>`count(*)::int`,
      })
        .from(editorialDocumentBlocks)
        .innerJoin(mediaItems, eq(mediaItems.id, editorialDocumentBlocks.mediaItemId))
        .where(and(
          eq(editorialDocumentBlocks.documentId, collection.documentId),
          eq(editorialDocumentBlocks.blockType, "media"),
        ));
      if (totalCount === 0) throw new Error("empty");
      if (publishedCount !== totalCount) throw new Error("items-unpublished");
    }
    const [updated] = await tx.update(editorialCollections).set({
      publicationStatus: status,
      updatedByAdminId: adminId,
      updatedAt: new Date(),
    }).where(eq(editorialCollections.id, id)).returning();
    return updated ?? null;
  });
}

export async function deleteEditorialCollection(id: number) {
  return db.transaction(async (tx) => {
    const [collection] = await tx.select().from(editorialCollections)
      .where(eq(editorialCollections.id, id)).limit(1).for("update");
    if (!collection) return null;
    await tx.delete(editorialDocuments).where(eq(editorialDocuments.id, collection.documentId));
    return collection;
  });
}

export async function getAdminEditorialCollections() {
  return db.select({
    id: editorialCollections.id,
    title: editorialCollections.title,
    slug: editorialCollections.slug,
    publicationStatus: editorialCollections.publicationStatus,
    coverObjectKey: editorialCollections.coverObjectKey,
    updatedAt: editorialCollections.updatedAt,
    itemsCount: sql<number>`count(${editorialDocumentBlocks.mediaItemId}) filter (where ${editorialDocumentBlocks.blockType} = 'media')::int`,
  }).from(editorialCollections)
    .leftJoin(editorialDocumentBlocks, eq(editorialDocumentBlocks.documentId, editorialCollections.documentId))
    .groupBy(editorialCollections.id)
    .orderBy(desc(editorialCollections.updatedAt), asc(editorialCollections.title))
    .then((rows) => rows.map((row) => ({ ...row, coverUrl: resolveCollectionImageUrl(row.coverObjectKey) })));
}

export async function getEditorialCollectionById(id: number) {
  const [collection] = await db.select().from(editorialCollections)
    .where(eq(editorialCollections.id, id)).limit(1);
  if (!collection) return null;
  return hydrateCollection(collection);
}

export async function getPublishedEditorialCollectionBySlug(slug: string, currentAuthorId?: number) {
  const [collection] = await db.select().from(editorialCollections)
    .where(and(eq(editorialCollections.slug, slug), eq(editorialCollections.publicationStatus, "published")))
    .limit(1);
  if (!collection) return null;
  return hydrateCollection(collection, currentAuthorId);
}

async function hydrateCollection(
  collection: typeof editorialCollections.$inferSelect,
  currentAuthorId?: number,
) {
  const rows = await getEditorialDocumentBlocks(collection.documentId);
  const ids = rows.flatMap((block) => block.type === "media" && block.mediaItemId ? [block.mediaItemId] : []);
  const [tiles, statuses] = await Promise.all([
    getMediaItemTilesByIds(ids, currentAuthorId),
    currentAuthorId && ids.length
      ? db.select({ mediaItemId: authorMediaStatuses.mediaItemId, status: authorMediaStatuses.status })
          .from(authorMediaStatuses)
          .where(and(eq(authorMediaStatuses.authorId, currentAuthorId), inArray(authorMediaStatuses.mediaItemId, ids)))
      : Promise.resolve([] as Array<{ mediaItemId: number; status: AuthorMediaStatus }>),
  ]);
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]));
  const statusById = new Map(statuses.map((item) => [item.mediaItemId, item.status]));
  const blocks: HydratedEditorialCollectionBlock[] = [];
  for (const block of rows) {
    if (block.type === "media") {
      const item = block.mediaItemId ? tileById.get(block.mediaItemId) : null;
      if (item) blocks.push({
        id: block.id,
        position: block.position,
        type: "media",
        mediaItemId: item.id,
        editorialComment: block.content,
        item,
        currentAuthorStatus: statusById.get(item.id) ?? null,
      });
    } else {
      blocks.push({ id: block.id, position: block.position, type: block.type, content: block.content! });
    }
  }
  return {
    ...collection,
    coverUrl: resolveCollectionImageUrl(collection.coverObjectKey),
    blocks,
  };
}

export async function getPublishedEditorialCollections() {
  return db.select({
    id: editorialCollections.id,
    title: editorialCollections.title,
    slug: editorialCollections.slug,
    description: editorialCollections.description,
    coverObjectKey: editorialCollections.coverObjectKey,
    updatedAt: editorialCollections.updatedAt,
    itemsCount: sql<number>`count(${editorialDocumentBlocks.mediaItemId}) filter (where ${editorialDocumentBlocks.blockType} = 'media')::int`,
  }).from(editorialCollections)
    .leftJoin(editorialDocumentBlocks, eq(editorialDocumentBlocks.documentId, editorialCollections.documentId))
    .where(eq(editorialCollections.publicationStatus, "published"))
    .groupBy(editorialCollections.id)
    .orderBy(desc(editorialCollections.updatedAt), asc(editorialCollections.title))
    .then((rows) => rows.map((row) => ({ ...row, coverUrl: resolveCollectionImageUrl(row.coverObjectKey) })));
}

export async function getMediaItemCollectionReferences(mediaItemId: number) {
  return db.select({ id: editorialCollections.id, title: editorialCollections.title })
    .from(editorialDocumentBlocks)
    .innerJoin(editorialCollections, eq(editorialCollections.documentId, editorialDocumentBlocks.documentId))
    .where(and(
      eq(editorialDocumentBlocks.mediaItemId, mediaItemId),
      eq(editorialDocumentBlocks.blockType, "media"),
    ))
    .orderBy(asc(editorialCollections.title));
}

export async function getCollectionImagePublicationStatus(key: string) {
  const [row] = await db.select({ publicationStatus: editorialCollections.publicationStatus }).from(editorialCollections)
    .where(eq(editorialCollections.coverObjectKey, key)).limit(1);
  return row?.publicationStatus ?? null;
}
