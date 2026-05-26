import { sql } from "drizzle-orm";

import { db } from "@/db";
import { authors, franchises, mediaItems, ratings } from "@/db/schema";

export async function getAdminDashboardStats() {
  const [mediaStatsResult, authorsStatsResult, ratingsStatsResult, franchisesStatsResult] =
    await Promise.all([
      db
        .select({
          totalCount: sql<number>`count(*)::int`,
          privateCount: sql<number>`count(*) filter (where ${mediaItems.publicationStatus} = 'private')::int`,
          submittedCount: sql<number>`count(*) filter (where ${mediaItems.publicationStatus} = 'submitted')::int`,
          publishedCount: sql<number>`count(*) filter (where ${mediaItems.publicationStatus} = 'published')::int`,
          rejectedCount: sql<number>`count(*) filter (where ${mediaItems.publicationStatus} = 'rejected')::int`,
        })
        .from(mediaItems),
      db
        .select({
          totalCount: sql<number>`count(*)::int`,
          blockedCount: sql<number>`count(*) filter (where ${authors.blockedAt} is not null)::int`,
        })
        .from(authors),
      db
        .select({
          totalCount: sql<number>`count(*)::int`,
        })
        .from(ratings),
      db
        .select({
          totalCount: sql<number>`count(*)::int`,
        })
        .from(franchises),
    ]);

  const mediaStats = mediaStatsResult[0];
  const authorsStats = authorsStatsResult[0];
  const ratingsStats = ratingsStatsResult[0];
  const franchisesStats = franchisesStatsResult[0];

  return {
    mediaItems: {
      totalCount: mediaStats?.totalCount ?? 0,
      privateCount: mediaStats?.privateCount ?? 0,
      submittedCount: mediaStats?.submittedCount ?? 0,
      publishedCount: mediaStats?.publishedCount ?? 0,
      rejectedCount: mediaStats?.rejectedCount ?? 0,
    },
    authors: {
      totalCount: authorsStats?.totalCount ?? 0,
      blockedCount: authorsStats?.blockedCount ?? 0,
    },
    ratings: {
      totalCount: ratingsStats?.totalCount ?? 0,
    },
    franchises: {
      totalCount: franchisesStats?.totalCount ?? 0,
    },
  };
}
