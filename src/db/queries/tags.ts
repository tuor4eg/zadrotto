import { and, asc, eq, inArray, isNull, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { authors, mediaItems, mediaItemTags, tags } from "@/db/schema";
import { containsNormalizedSearchSql, normalizeSearchSql } from "@/db/search";
import { runInDomainEventTransaction } from "@/db/transaction";
import { generateEntityCode } from "@/lib/common/generated-code";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import { normalizeSearchText } from "@/lib/search/normalize";
import { paginatePublicTags } from "@/lib/tags/public-tags";
import { parseTagTitle, type VisibleMediaItemTag, type AdminTagStatus } from "@/lib/tags/model";
import { lockClassificationMutations } from "./classification-lock";
import { publicTagMembershipSql, publicTagPairsSql } from "./tag-membership";
export { publicTagMediaItemIdsSql, publicTagMembershipSql } from "./tag-membership";

function tagIsSystemSql() {
  return sql<boolean>`exists(select 1 from media_item_tags assignment
    inner join authors tag_author on tag_author.id=assignment.author_id
    where assignment.tag_id="tags"."id" and tag_author.is_system)`;
}

function tagHasDependenciesSql() {
  return sql<boolean>`exists(select 1 from genres genre where genre.replacement_tag_id="tags"."id")
    or exists(select 1 from achievements achievement where achievement.params->'tagId'=to_jsonb("tags"."id"))
    or exists(select 1 from classification_migration_runs migration
      where migration.status in ('approved','applied') and (
        migration.before_snapshot->'tags' @> jsonb_build_array(jsonb_build_object('id',"tags"."id"))
        or migration.after_snapshot->'tags' @> jsonb_build_array(jsonb_build_object('id',"tags"."id"))))`;
}

/** Administrative caller authenticates before invoking this operation. */
export async function deleteAdminTag(tagId: number) {
  if (!Number.isSafeInteger(tagId) || tagId < 1) throw new Error("invalid-tag");
  return runInDomainEventTransaction(async (tx, append) => {
    await lockClassificationMutations(tx);
    const [tag] = await tx.select({ id: tags.id, isSystem: tagIsSystemSql(), hasDependencies: tagHasDependenciesSql() })
      .from(tags).where(eq(tags.id, tagId)).for("update");
    if (!tag) return;
    if (tag.isSystem) throw new Error("system-tag");
    if (tag.hasDependencies) throw new Error("tag-dependencies");
    const removed = await tx.delete(mediaItemTags).where(eq(mediaItemTags.tagId, tagId)).returning({ mediaItemId: mediaItemTags.mediaItemId });
    await tx.delete(tags).where(eq(tags.id, tagId));
    for (const mediaItemId of new Set(removed.map(row => row.mediaItemId))) await append({
      type: "media-tag.changed", actorAuthorId: null,
      aggregateType: "media-item", aggregateId: String(mediaItemId), payload: { mediaItemId, tagId },
    });
  });
}

export async function searchTags(query: string) {
  if (!normalizeSearchText(query)) return [];
  return db.select({ id: tags.id, code: tags.code, title: tags.title }).from(tags)
    .where(containsNormalizedSearchSql(tags.title, query.slice(0, 80)))
    .orderBy(asc(tags.title), asc(tags.id)).limit(20);
}

export async function getTagByCode(code: string) {
  const [tag] = await db.select().from(tags).where(eq(tags.code, code)).limit(1);
  return tag ?? null;
}

function visibleTagExpressions(mediaItemId: SQLWrapper, authorId?: number) {
  const isPublic = publicTagMembershipSql(mediaItemId, sql`"tags"."id"`);
  const isMine = authorId === undefined ? sql<boolean>`false` : sql<boolean>`exists (
    select 1 from media_item_tags own_assignment where own_assignment.media_item_id = ${mediaItemId}
      and own_assignment.tag_id = "tags"."id" and own_assignment.author_id = ${authorId})`;
  const isEditorial = sql<boolean>`exists (select 1 from media_item_tags editorial_assignment
    inner join authors editorial_author on editorial_author.id = editorial_assignment.author_id
    where editorial_assignment.media_item_id = ${mediaItemId} and editorial_assignment.tag_id = "tags"."id"
      and editorial_author.is_system)`;
  return { isPublic, isMine, isEditorial };
}

export async function getVisibleMediaItemTags(mediaItemId: number, authorId?: number): Promise<VisibleMediaItemTag[]> {
  const { isPublic, isMine, isEditorial } = visibleTagExpressions(sql`${mediaItemId}`, authorId);
  return db.select({ id: tags.id, code: tags.code, title: tags.title, isPublic, isMine, isEditorial })
    .from(tags).where(sql`exists (select 1 from media_item_tags assigned
      where assigned.media_item_id = ${mediaItemId} and assigned.tag_id = ${tags.id})
      and (${isPublic} or ${isMine})`).orderBy(asc(tags.title), asc(tags.id));
}

/** One bounded query for every record on the current catalog page. */
export async function getVisibleMediaItemTagsForItems(mediaItemIds: readonly number[], authorId?: number) {
  const result = new Map<number, VisibleMediaItemTag[]>();
  if (!mediaItemIds.length) return result;
  const expressions = visibleTagExpressions(sql`candidate.media_item_id`, authorId);
  const rows = await db.select({ mediaItemId: sql<number>`candidate.media_item_id`, id: tags.id, code: tags.code, title: tags.title, ...expressions })
    .from(sql`(select distinct media_item_id, tag_id from media_item_tags
      where ${inArray(mediaItemTags.mediaItemId, [...mediaItemIds])}) candidate`)
    .innerJoin(tags, sql`${tags.id}=candidate.tag_id`)
    .where(sql`(${expressions.isPublic} or ${expressions.isMine})`)
    .orderBy(asc(tags.title), asc(tags.id));
  for (const { mediaItemId, ...tag } of rows) {
    const tagsForItem = result.get(mediaItemId) ?? [];
    tagsForItem.push(tag);
    result.set(mediaItemId, tagsForItem);
  }
  return result;
}

/** Caller authenticates session and verifies access to this media type; author ID is never client supplied. */
export async function mutateMediaItemTag(input: {
  mediaItemId: number; authorId: number; tagId?: number; title?: string; remove?: boolean; editorial?: boolean;
}) {
  if (!Number.isSafeInteger(input.mediaItemId) || input.mediaItemId < 1 ||
      (input.tagId !== undefined && (!Number.isSafeInteger(input.tagId) || input.tagId < 1)) ||
      (!input.tagId && (input.remove || input.title === undefined))) throw new Error("invalid-tag");
  return runInDomainEventTransaction(async (tx, append) => {
    await lockClassificationMutations(tx);
    const [author] = await tx.select().from(authors).where(and(eq(authors.id, input.authorId), isNull(authors.blockedAt), isNull(authors.mergedIntoAuthorId))).for("share");
    if (!author || author.isSystem !== Boolean(input.editorial)) throw new Error("tag-forbidden");
    const [item] = await tx.select({ id: mediaItems.id }).from(mediaItems)
      .where(and(eq(mediaItems.id, input.mediaItemId), eq(mediaItems.publicationStatus, "published"))).for("share");
    if (!item) throw new Error("invalid-tag");
    let tagId = input.tagId;
    if (!tagId) {
      const title = parseTagTitle(input.title);
      // The unique expression index arbitrates concurrent creation, including across different records.
      const [created] = await tx.insert(tags).values({ title, code: generateEntityCode({ type: "tag", name: title }) })
        .onConflictDoNothing().returning({ id: tags.id });
      const [existing] = created ? [created] : await tx.select({ id: tags.id }).from(tags)
        .where(sql`${normalizeSearchSql(tags.title)} = ${normalizeSearchText(title)}`);
      if (!existing) throw new Error("invalid-tag");
      tagId = existing.id;
    }
    const changed = input.remove
      ? await tx.delete(mediaItemTags).where(and(eq(mediaItemTags.mediaItemId, input.mediaItemId), eq(mediaItemTags.tagId, tagId), eq(mediaItemTags.authorId, author.id))).returning()
      : await tx.insert(mediaItemTags).values({ mediaItemId: input.mediaItemId, tagId, authorId: author.id }).onConflictDoNothing().returning();
    if (input.remove && changed.length && !input.editorial) {
      // Keep dictionary identities used elsewhere, including snapshots needed for migration rollback.
      await tx.execute(sql`delete from tags where id=${tagId}
        and not exists(select 1 from media_item_tags assignment where assignment.tag_id=tags.id)
        and not (${tagHasDependenciesSql()})`);
    }
    if (changed.length) await append({
      type: "media-tag.changed", actorAuthorId: input.editorial ? null : author.id,
      aggregateType: "media-item", aggregateId: String(input.mediaItemId),
      payload: { mediaItemId: input.mediaItemId, tagId },
    });
    return { tagId, changed: changed.length > 0 };
  });
}


export async function getAdminTagsPage(input: { searchQuery: string; page: number; status?: AdminTagStatus }) {
  const pageSize = 25;
  const query = normalizeSearchText(input.searchQuery);
  const where = and(
    query ? containsNormalizedSearchSql(tags.title, query) : undefined,
    input.status === "system" ? tagIsSystemSql() : input.status === "ordinary" ? sql`not (${tagIsSystemSql()})` : undefined,
  );
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(tags).where(where);
  const totalPages = getTotalPages(count.total, pageSize);
  const requestedPage = Number.isSafeInteger(input.page) ? input.page : 1;
  const page = clampPage(requestedPage, totalPages);
  const items = await db.select({ id: tags.id, code: tags.code, title: tags.title, isSystem: tagIsSystemSql() }).from(tags).where(where)
    .orderBy(asc(tags.title), asc(tags.id)).limit(pageSize).offset(getOffset(page, pageSize));
  return { items, total: count.total, page, pageSize, totalPages };
}

export async function hasPublicTags(enabledMediaTypeCodes: readonly string[]) {
  if (!enabledMediaTypeCodes.length) return false;
  const rows = await db.select({ id: mediaItems.id }).from(mediaItems)
    .innerJoin(sql`(${publicTagPairsSql()}) public_pair`, sql`public_pair.media_item_id = ${mediaItems.id}`)
    .where(and(eq(mediaItems.publicationStatus, "published"), inArray(mediaItems.mediaType, [...enabledMediaTypeCodes])))
    .limit(1);
  return rows.length > 0;
}

export async function getPublicTagsPage(input: {
  enabledMediaTypeCodes: readonly string[]; letter?: string; page: number; pageSize: number; searchQuery: string;
}) {
  if (!input.enabledMediaTypeCodes.length) return paginatePublicTags([], input);
  const search = normalizeSearchText(input.searchQuery);
  const rows = await db.select({ id: tags.id, code: tags.code, title: tags.title,
    mediaItemsCount: sql<number>`count(*)::int`,
    nameMatches: search ? sql<boolean>`${containsNormalizedSearchSql(tags.title, search)}` : sql<boolean>`true`,
  }).from(tags)
    .innerJoin(sql`(${publicTagPairsSql()}) public_pair`, sql`public_pair.tag_id = ${tags.id}`)
    .innerJoin(mediaItems, sql`${mediaItems.id} = public_pair.media_item_id`)
    .where(and(eq(mediaItems.publicationStatus, "published"), inArray(mediaItems.mediaType, [...input.enabledMediaTypeCodes])))
    .groupBy(tags.id);
  return paginatePublicTags(rows, input);
}
