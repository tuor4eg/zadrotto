import { and, asc, eq, inArray, isNull, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { authors, mediaItems, mediaItemTags, tags } from "@/db/schema";
import { containsNormalizedSearchSql, normalizeSearchSql } from "@/db/search";
import { runInDomainEventTransaction, type DbTransaction } from "@/db/transaction";
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

/** Called inside creation of a new private record, before it can be submitted or published. */
export async function assignExistingTagsToNewDraft(tx: DbTransaction, input: {
  mediaItemId: number;
  authorId: number;
  tagIds: readonly number[];
}) {
  const tagIds = [...new Set(input.tagIds)];
  if (!tagIds.length) return;

  const existing = await tx.select({ id: tags.id }).from(tags)
    .where(inArray(tags.id, tagIds)).for("key share");
  if (existing.length !== tagIds.length) throw new Error("invalid-tags");

  await tx.insert(mediaItemTags).values(tagIds.map((tagId) => ({
    mediaItemId: input.mediaItemId,
    authorId: input.authorId,
    tagId,
  })));
}

async function getOrCreateTag(tx: DbTransaction, title: string) {
  const [created] = await tx.insert(tags).values({ title, code: generateEntityCode({ type: "tag", name: title }) })
    .onConflictDoNothing().returning({ id: tags.id });
  if (created) return created.id;

  const [existing] = await tx.select({ id: tags.id }).from(tags)
    .where(sql`${normalizeSearchSql(tags.title)} = ${normalizeSearchText(title)}`);
  if (!existing) throw new Error("invalid-tag");
  return existing.id;
}

async function deleteUnusedTag(tx: DbTransaction, tagId: number) {
  await tx.execute(sql`delete from tags where id=${tagId}
    and not exists(select 1 from media_item_tags assignment where assignment.tag_id=tags.id)
    and not (${tagHasDependenciesSql()})`);
}

export function getAdminMediaItemTagGroups(mediaItemId: number) {
  return db.select({
    id: tags.id,
    title: tags.title,
    count: sql<number>`count(*)::int`,
    editorial: sql<boolean>`bool_or(${authors.isSystem})`,
  }).from(mediaItemTags)
    .innerJoin(tags, eq(tags.id, mediaItemTags.tagId))
    .innerJoin(authors, eq(authors.id, mediaItemTags.authorId))
    .where(eq(mediaItemTags.mediaItemId, mediaItemId))
    .groupBy(tags.id)
    .orderBy(asc(tags.title), asc(tags.id));
}

export type AdminMediaTagChange =
  | { operation: "add"; title: string }
  | { operation: "rename"; tagId: number; title: string }
  | { operation: "pin" | "unpin" | "delete" | "attach"; tagId: number };

/** Mutates assignments for a single record after authentication by the admin action. */
export function changeAdminMediaItemTag(mediaItemId: number, change: AdminMediaTagChange) {
  return runInDomainEventTransaction(async (tx, append) => {
    await lockClassificationMutations(tx);
    const [item] = await tx.select({ id: mediaItems.id, code: mediaItems.code, title: mediaItems.title })
      .from(mediaItems).where(eq(mediaItems.id, mediaItemId)).for("share");
    if (!item) throw new Error("invalid-tag");

    const publishChange = (tagId: number) => append({
      type: "media-tag.changed", actorAuthorId: null,
      aggregateType: "media-item", aggregateId: String(mediaItemId), payload: { mediaItemId, tagId },
    });
    const assignEditorial = async (tagId: number) => {
      const [editor] = await tx.select({ id: authors.id }).from(authors)
        .where(and(eq(authors.isSystem, true), isNull(authors.blockedAt), isNull(authors.mergedIntoAuthorId)))
        .orderBy(sql`case when ${normalizeSearchSql(authors.name)} = ${normalizeSearchText("Редакция")} then 0 else 1 end`, asc(authors.id))
        .limit(1).for("share");
      if (!editor) throw new Error("editorial-author-missing");
      const assigned = await tx.insert(mediaItemTags)
        .values({ mediaItemId, tagId, authorId: editor.id })
        .onConflictDoNothing().returning({ tagId: mediaItemTags.tagId });
      if (assigned.length) await publishChange(tagId);
      return assigned.length > 0;
    };

    if (change.operation === "add") {
      const tagId = await getOrCreateTag(tx, parseTagTitle(change.title));
      return { item, tagId, changed: await assignEditorial(tagId) };
    }

    const tagId = change.tagId;
    const group = and(eq(mediaItemTags.mediaItemId, mediaItemId), eq(mediaItemTags.tagId, tagId));
    const assignments = await tx.select({ authorId: authors.id, editorial: authors.isSystem, title: tags.title })
      .from(mediaItemTags)
      .innerJoin(authors, eq(authors.id, mediaItemTags.authorId))
      .innerJoin(tags, eq(tags.id, mediaItemTags.tagId))
      .where(group);
    const editorial = assignments.filter((row) => row.editorial);

    if (change.operation === "pin" || change.operation === "attach") {
      if (!assignments.length) {
        if (change.operation === "pin") throw new Error("tag-group-changed");
        const [tag] = await tx.select({ id: tags.id }).from(tags).where(eq(tags.id, tagId));
        if (!tag) throw new Error("invalid-tag");
      }
      return { item, tagId, changed: !editorial.length && await assignEditorial(tagId) };
    }

    if (change.operation === "rename") {
      if (assignments.length !== 1 || editorial.length !== 1) throw new Error("tag-group-changed");
      const title = parseTagTitle(change.title);
      if (title === editorial[0].title) return { item, tagId, changed: false };
      const nextTagId = await getOrCreateTag(tx, title);
      if (nextTagId === tagId) {
        const [otherAssignment] = await tx.select({ id: mediaItemTags.mediaItemId }).from(mediaItemTags)
          .where(and(eq(mediaItemTags.tagId, tagId), sql`${mediaItemTags.mediaItemId} <> ${mediaItemId}`)).limit(1);
        if (otherAssignment) throw new Error("tag-shared-title");
        await tx.update(tags).set({ title }).where(eq(tags.id, tagId));
      } else {
        await assignEditorial(nextTagId);
        await tx.delete(mediaItemTags).where(group);
        await deleteUnusedTag(tx, tagId);
      }
      await publishChange(tagId);
      return { item, tagId, changed: true };
    }

    if (change.operation === "delete" && editorial.length) throw new Error("tag-group-changed");
    if (!assignments.length || (change.operation === "unpin" && !editorial.length)) {
      return { item, tagId, changed: false };
    }
    await tx.delete(mediaItemTags).where(change.operation === "unpin"
      ? and(group, inArray(mediaItemTags.authorId, editorial.map(({ authorId }) => authorId)))
      : group);
    await deleteUnusedTag(tx, tagId);
    await publishChange(tagId);
    return { item, tagId, changed: true };
  });
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
    if (!tagId) tagId = await getOrCreateTag(tx, parseTagTitle(input.title));
    const changed = input.remove
      ? await tx.delete(mediaItemTags).where(and(eq(mediaItemTags.mediaItemId, input.mediaItemId), eq(mediaItemTags.tagId, tagId), eq(mediaItemTags.authorId, author.id))).returning()
      : await tx.insert(mediaItemTags).values({ mediaItemId: input.mediaItemId, tagId, authorId: author.id }).onConflictDoNothing().returning();
    if (input.remove && changed.length && !input.editorial) await deleteUnusedTag(tx, tagId);
    if (changed.length) await append({
      type: "media-tag.changed", actorAuthorId: input.editorial ? null : author.id,
      aggregateType: "media-item", aggregateId: String(input.mediaItemId),
      payload: { mediaItemId: input.mediaItemId, tagId },
    });
    return { tagId, changed: changed.length > 0 };
  });
}


export async function getAdminTagById(tagId: number) {
  const [tag] = await db.select({ id: tags.id, title: tags.title, code: tags.code })
    .from(tags).where(eq(tags.id, tagId));
  return tag ?? null;
}

export async function renameAdminTag(tagId: number, rawTitle: string) {
  const title = parseTagTitle(rawTitle);
  return db.transaction(async (tx) => {
    await lockClassificationMutations(tx);
    const [tag] = await tx.select({ id: tags.id, title: tags.title })
      .from(tags).where(eq(tags.id, tagId)).for("update");
    if (!tag) throw new Error("invalid-tag");
    if (tag.title === title) return null;

    const [conflict] = await tx.select({ id: tags.id }).from(tags).where(and(
      sql`${tags.id} <> ${tagId}`,
      sql`${normalizeSearchSql(tags.title)} = ${normalizeSearchText(title)}`,
    )).limit(1);
    if (conflict) throw new Error("tag-title-taken");
    await tx.update(tags).set({ title }).where(eq(tags.id, tagId));
    return { previousTitle: tag.title, title };
  });
}

export async function getAdminTagEntriesPage(tagId: number, requestedPage: number) {
  const pageSize = 25;
  const where = eq(mediaItemTags.tagId, tagId);
  const [count] = await db.select({ total: sql<number>`count(distinct ${mediaItemTags.mediaItemId})::int` })
    .from(mediaItemTags).where(where);
  const totalPages = getTotalPages(count.total, pageSize);
  const page = clampPage(requestedPage, totalPages);
  const items = await db.select({
    id: mediaItems.id,
    title: mediaItems.title,
    releaseYear: mediaItems.releaseYear,
    mediaType: mediaItems.mediaType,
    count: sql<number>`count(*)::int`,
    editorial: sql<boolean>`bool_or(${authors.isSystem})`,
  }).from(mediaItemTags)
    .innerJoin(mediaItems, eq(mediaItems.id, mediaItemTags.mediaItemId))
    .innerJoin(authors, eq(authors.id, mediaItemTags.authorId))
    .where(where)
    .groupBy(mediaItems.id)
    .orderBy(asc(mediaItems.title), asc(mediaItems.id))
    .limit(pageSize).offset(getOffset(page, pageSize));
  return { items, total: count.total, page, pageSize, totalPages };
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
  const items = await db.select({
    id: tags.id,
    code: tags.code,
    title: tags.title,
    isSystem: tagIsSystemSql(),
    mediaItemsCount: sql<number>`(
      select count(distinct assignment.media_item_id)::int
      from media_item_tags assignment where assignment.tag_id = "tags"."id"
    )`,
  }).from(tags).where(where)
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
