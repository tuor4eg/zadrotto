import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ratings } from "@/db/schema";

/** One derived vote per author and record; never persisted as an explicit rating. */
export function getEffectiveRatingsQuery() {
  return db.select({
    id: sql<number>`max(${ratings.id})`.as("id"),
    mediaItemId: ratings.mediaItemId,
    authorId: ratings.authorId,
    score: sql<number>`coalesce(max(${ratings.score}) filter (where ${ratings.partId} is null),
      avg(${ratings.score}) filter (where ${ratings.partId} is not null))::double precision`.as("score"),
    distributionScore: sql<number>`(round(coalesce(max(${ratings.score}) filter (where ${ratings.partId} is null),
      avg(${ratings.score}) filter (where ${ratings.partId} is not null)) / 10) * 10)::integer`.as("distribution_score"),
    createdAt: sql<Date>`min(${ratings.createdAt})`.mapWith(ratings.createdAt).as("created_at"),
    updatedAt: sql<Date>`max(${ratings.updatedAt})`.mapWith(ratings.updatedAt).as("updated_at"),
  }).from(ratings).where(rateableRatingSql).groupBy(ratings.mediaItemId, ratings.authorId).as("effective_ratings");
}

// Drizzle SQL.Aliased fields become bare identifiers when interpolated in another
// SQL expression. Qualify computed columns explicitly in aggregates and GROUP BY.
export const effectiveRatingColumns = {
  id: sql<number>`"effective_ratings"."id"`,
  score: sql<number>`"effective_ratings"."score"`,
  distributionScore: sql<number>`"effective_ratings"."distribution_score"`,
  createdAt: sql<Date>`"effective_ratings"."created_at"`,
  updatedAt: sql<Date>`"effective_ratings"."updated_at"`,
};

/** Retain historical specials ratings, but exclude them from all derived votes. */
export const rateableRatingSql = sql`NOT EXISTS (
  SELECT 1 FROM title_parts special_part
  WHERE special_part.id = ${ratings.partId}
    AND special_part.type = 'season' AND special_part.number = 0
)`;
