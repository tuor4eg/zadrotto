import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { franchises, genres, mediaItemFranchises, mediaItemGenres, mediaItems } from "@/db/schema";
import { lockMediaItemFranchiseMutations } from "@/db/queries/franchises";
import { missingGenreSeriesBindingSql } from "@/db/queries/media-item-genres";
import { publishedSeriesMembershipSql } from "@/db/queries/series-membership";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";

/** One finite pass over published candidates present when the administrator starts the run. */
export async function backfillGenreSeriesLinks(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const candidates = await db.select({ id: mediaItems.id }).from(mediaItems)
    .where(and(eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), missingGenreSeriesBindingSql()))
    .orderBy(asc(mediaItems.id));
  let addedLinks = 0;
  let updatedRecords = 0;
  for (const candidate of candidates) {
    signal?.throwIfAborted();
    const added = await db.transaction(async (tx) => {
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
        .where(and(inArray(genres.id, linkedGenres.map((row) => row.genreId)), eq(genres.isActive, true)))
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
  return { candidateRecords: candidates.length, updatedRecords, addedLinks };
}
