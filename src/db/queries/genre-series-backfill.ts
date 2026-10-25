import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { franchises, genres, mediaItemFranchises, mediaItemGenres, mediaItems } from "@/db/schema";
import { lockMediaItemFranchiseMutations } from "@/db/queries/franchises";
import { visibleGenreSql } from "@/db/queries/media-item-genres";
import { publishedSeriesMembershipSql } from "@/db/queries/series-membership";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";

type GenreSeriesScope = { genreId: number; afterId: number; throughId: number; limit: number };
export function genreSeriesCandidatesQuery(input: GenreSeriesScope) {
  const query = db.select({ id: mediaItems.id }).from(mediaItems).where(and(
    eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
    sql`exists (select 1 from media_item_genres mg join genres g on g.id=mg.genre_id
      where mg.media_item_id=${mediaItems.id} and g.id=${input.genreId} and g.is_active=true
      and g.replacement_franchise_id is not null and ${visibleGenreSql(mediaItems.id, sql`g.replacement_franchise_id`)})`,
    gt(mediaItems.id, input.afterId),
    lte(mediaItems.id, input.throughId),
  )).orderBy(asc(mediaItems.id));
  return query.limit(input.limit + 1);
}
/** Bounded subject-specific application; the historical global pass is retired. */
export async function applyGenreSeriesLinks(input: GenreSeriesScope, signal?: AbortSignal, jobGuard?: SnapshotJobGuard) {
  signal?.throwIfAborted();
  const rows = await genreSeriesCandidatesQuery(input);
  const candidates = rows.slice(0, input.limit);
  let addedLinks = 0;
  let updatedRecords = 0;
  for (const candidate of candidates) {
    signal?.throwIfAborted();
    const added = await withSnapshotJobGuard(jobGuard, async (tx) => {
      await lockMediaItemFranchiseMutations(tx, [candidate.id]);
      const [item] = await tx.select({ id: mediaItems.id }).from(mediaItems)
        .where(and(eq(mediaItems.id, candidate.id), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS)))
        .for("update");
      if (!item) return 0;
      // Preserve current genre settings until this record's links are committed.
      const linkedGenres = await tx.select({ genreId: mediaItemGenres.genreId }).from(mediaItemGenres)
        .where(eq(mediaItemGenres.mediaItemId, item.id));
      if (!linkedGenres.length) return 0;
      const genreRows = await tx.select({ franchiseId: genres.replacementFranchiseId }).from(genres)
        .where(and(inArray(genres.id, linkedGenres.map((row) => row.genreId)), eq(genres.isActive, true), eq(genres.id, input.genreId)))
        .orderBy(asc(genres.id)).for("share");
      const seriesIds = [...new Set(genreRows.flatMap((genre) => genre.franchiseId === null ? [] : [genre.franchiseId]))];
      if (!seriesIds.length) return 0;
      const publishedSeries = await tx.select({ id: franchises.id }).from(franchises)
        .where(and(inArray(franchises.id, seriesIds), eq(franchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS)))
        .orderBy(asc(franchises.id)).for("share");
      if (!publishedSeries.length) return 0;
      // Add descendants first so adding a child satisfies the matching parent genre too.
      const orderedSeries = await tx.execute<{ id: number }>(sql`
        with recursive ancestors as (
          select id, parent_id, id as descendant_id, 0 as depth from franchises
          where id in (${sql.join(publishedSeries.map((series) => sql`${series.id}`), sql`, `)})
          union all
          select parent.id, parent.parent_id, ancestors.descendant_id, ancestors.depth + 1
          from franchises parent inner join ancestors on parent.id = ancestors.parent_id
          where parent.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
        )
        select descendant_id as id from ancestors group by descendant_id order by max(depth) desc, descendant_id
      `);
      let added = 0;
      for (const series of orderedSeries) {
        signal?.throwIfAborted();
        const [membership] = await tx.select({ exists: publishedSeriesMembershipSql(sql`${item.id}`, sql`${series.id}`) })
          .from(mediaItems).where(eq(mediaItems.id, item.id));
        if (membership.exists) continue;
        const inserted = await tx.insert(mediaItemFranchises).values({
          mediaItemId: item.id, franchiseId: series.id, publicationStatus: PUBLISHED_PUBLICATION_STATUS,
        }).onConflictDoNothing().returning({ id: mediaItemFranchises.franchiseId });
        added += inserted.length;
      }
      signal?.throwIfAborted();
      return added;
    });
    addedLinks += added;
    if (added > 0) updatedRecords++;
  }
  return { candidateRecords: candidates.length, updatedRecords, addedLinks, lastId: candidates.at(-1)?.id, hasMore: rows.length > input.limit };
}
