import { and, asc, eq, inArray, ne, notExists, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { creators, entryCreatorPseudonyms, entryCreators, entrySources, franchises, mediaItems, mediaItemTags, mediaTypes } from "@/db/schema";
import { containsNormalizedSearchSql } from "@/db/search";
import { creatorDisplayNameSql, creatorNameSearchSql } from "@/db/queries/creator-display";
import { mediaItemTitleSearchCondition } from "@/db/queries/media-item-search";
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types";
import { entrySourceKey, type EntrySource, type EntrySourceOption, type EntrySourceSearchOption, type EntrySourceType } from "@/lib/media/entry-sources";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { normalizeSearchText } from "@/lib/search/normalize";

const creatorName = creatorDisplayNameSql().as("label");
const creatorOption = { id: creators.id, label: creatorName, code: creators.slug };
const entryOption = {
  id: mediaItems.id,
  label: mediaItems.title,
  code: mediaItems.code,
  mediaTypeName: mediaTypes.name,
  releaseYear: mediaItems.releaseYear,
};
const seriesOption = { id: franchises.id, label: franchises.title, code: franchises.code };

function visibleEntry(codes: readonly string[]) {
  return and(
    eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
    eq(mediaTypes.isPubliclyAvailable, true),
    getMediaTypeCodeFilterSql(mediaItems.mediaType, codes),
  );
}

export async function getEntrySources(entryId: number, publicMediaTypeCodes?: readonly string[]): Promise<EntrySourceOption[]> {
  const ownLinks = eq(entrySources.entryId, entryId);
  const [people, entries, series] = await Promise.all([
    db.select({ ...creatorOption, avatarObjectKey: creators.avatarObjectKey }).from(entrySources)
      .innerJoin(creators, eq(creators.id, entrySources.creatorId))
      .where(ownLinks).orderBy(asc(entrySources.id)),
    db.select(entryOption).from(entrySources)
      .innerJoin(mediaItems, eq(mediaItems.id, entrySources.sourceEntryId))
      .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
      .where(and(ownLinks, publicMediaTypeCodes && visibleEntry(publicMediaTypeCodes)))
      .orderBy(asc(entrySources.id)),
    db.select(seriesOption).from(entrySources)
      .innerJoin(franchises, eq(franchises.id, entrySources.sourceSeriesId))
      .where(and(ownLinks, publicMediaTypeCodes && eq(franchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS)))
      .orderBy(asc(entrySources.id)),
  ]);
  return [
    ...people.map((option) => ({ ...option, type: "creator" as const })),
    ...entries.map((option) => ({ ...option, type: "entry" as const })),
    ...series.map((option) => ({ ...option, type: "series" as const })),
  ];
}

export function entryHasRelationshipsSql() {
  return sql<boolean>`(
    exists (select 1 from ${entrySources} where ${entrySources.entryId} = "media_items"."id")
    or exists (select 1 from ${entrySources} where ${entrySources.sourceEntryId} = "media_items"."id")
  )`;
}

export function getWorksBasedOn(type: "entry" | "series", id: number, visibility: readonly string[] | "admin") {
  const source = type === "entry" ? entrySources.sourceEntryId : entrySources.sourceSeriesId;
  return db.select(entryOption).from(entrySources)
    .innerJoin(mediaItems, eq(mediaItems.id, entrySources.entryId))
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .where(and(eq(source, id), visibility === "admin" ? undefined : visibleEntry(visibility)))
    .orderBy(asc(mediaItems.title), asc(mediaItems.id));
}

export function creatorWorksCondition(creatorId: number, publicMediaTypeCodes: readonly string[]) {
  const credits = db.select({ entryId: entryCreators.entryId }).from(entryCreators)
    .where(eq(entryCreators.creatorId, creatorId))
    .unionAll(db.select({ entryId: entryCreatorPseudonyms.entryId }).from(entryCreatorPseudonyms)
      .where(eq(entryCreatorPseudonyms.creatorId, creatorId)));
  const originals = db.select({ id: mediaItems.id }).from(mediaItems)
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .where(and(inArray(mediaItems.id, credits), visibleEntry(publicMediaTypeCodes)));
  return inArray(mediaItems.id, sql`(
    select entry_id from entry_sources where creator_id = ${creatorId}
    union all
    select entry_id from entry_sources where source_entry_id in (${originals})
  )`);
}

export async function searchEntrySourceOptions(
  type: EntrySourceType,
  query: string,
  entryId: number | null,
  excludedIds: number[],
  excludedTagId?: number,
): Promise<EntrySourceSearchOption[]> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2) return [];

  const noMediaDetails = {
    mediaTypeName: sql<string | null>`null::text`.as("media_type_name"),
    releaseYear: sql<number | null>`null::integer`.as("release_year"),
  };
  const options = type === "creator"
    ? db.select({ ...creatorOption, ...noMediaDetails }).from(creators).where(creatorNameSearchSql(normalizedQuery))
    : type === "entry"
      ? db.select(entryOption)
        .from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
        .where(and(
          entryId === null ? undefined : ne(mediaItems.id, entryId),
          mediaItemTitleSearchCondition(normalizedQuery),
          excludedTagId === undefined ? undefined : notExists(
            db.select({ id: mediaItemTags.mediaItemId }).from(mediaItemTags)
              .where(and(eq(mediaItemTags.mediaItemId, mediaItems.id), eq(mediaItemTags.tagId, excludedTagId))),
          ),
        ))
      : db.select({ ...seriesOption, ...noMediaDetails }).from(franchises).where(or(
        containsNormalizedSearchSql(franchises.title, normalizedQuery),
        containsNormalizedSearchSql(franchises.originalTitle, normalizedQuery),
      ));

  const matches = options.as("source_options");
  const rows = await db.select().from(matches)
    .where(excludedIds.length ? sql`not (${inArray(matches.id, excludedIds)})` : undefined)
    .orderBy(asc(matches.label), asc(matches.id)).limit(20);
  return rows.map((row) => ({ ...row, type }));
}

function sourceColumns(source: EntrySource) {
  return {
    creatorId: source.type === "creator" ? source.id : null,
    sourceEntryId: source.type === "entry" ? source.id : null,
    sourceSeriesId: source.type === "series" ? source.id : null,
  };
}

export function saveEntrySources(entryId: number, sources: EntrySource[]) {
  return db.transaction(async (tx) => {
    const [entry] = await tx.select({ id: mediaItems.id }).from(mediaItems)
      .where(eq(mediaItems.id, entryId)).for("no key update");
    if (!entry) return false;

    const existing = await tx.select().from(entrySources).where(eq(entrySources.entryId, entryId));
    const existingByKey = new Map(existing.map((row) => {
      const source: EntrySource = row.creatorId !== null
        ? { type: "creator", id: row.creatorId }
        : row.sourceEntryId !== null
          ? { type: "entry", id: row.sourceEntryId }
          : { type: "series", id: row.sourceSeriesId! };
      return [entrySourceKey(source), row.id];
    }));
    const requested = new Set(sources.map(entrySourceKey));
    const removed = [...existingByKey].filter(([key]) => !requested.has(key)).map(([, id]) => id);
    const added = sources.filter((source) => !existingByKey.has(entrySourceKey(source)));
    if (removed.length) await tx.delete(entrySources).where(inArray(entrySources.id, removed));
    // Foreign keys validate new targets under concurrent deletes and roll back the entire edit.
    if (added.length) await tx.insert(entrySources).values(added.map((source) => ({ entryId, ...sourceColumns(source) })));
    return true;
  });
}

export function updateWorksBasedOn(sourceEntryId: number, addedIds: number[], removedIds: number[]) {
  return db.transaction(async (tx) => {
    const affectedIds = [...new Set([sourceEntryId, ...addedIds, ...removedIds])];
    const entries = await tx.select({ id: mediaItems.id }).from(mediaItems)
      .where(inArray(mediaItems.id, affectedIds)).orderBy(asc(mediaItems.id)).for("no key update");
    const existingIds = new Set(entries.map(({ id }) => id));
    if (!existingIds.has(sourceEntryId) || addedIds.some((id) => !existingIds.has(id))) return false;

    if (removedIds.length) {
      await tx.delete(entrySources).where(and(
        eq(entrySources.sourceEntryId, sourceEntryId),
        inArray(entrySources.entryId, removedIds),
      ));
    }
    if (addedIds.length) {
      await tx.insert(entrySources).values(addedIds.map((entryId) => ({ entryId, sourceEntryId })))
        .onConflictDoNothing();
    }
    return true;
  });
}
