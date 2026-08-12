import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  achievements,
  authors,
  contributions,
  mediaItems,
  ratings,
  userAchievements,
} from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import type { DomainEventType } from "@/lib/domain-events/catalog";
import {
  getAchievementDefinitionsForEvent,
  type AchievementCode,
  type AchievementEvaluationContext,
} from "./catalog";

type EvaluateAchievementsInput = {
  achievementCodes?: readonly AchievementCode[];
  authorIds: readonly number[];
  awardGroupId: string;
  eventType?: DomainEventType;
  sourceEventId?: string | null;
};

export async function evaluateAchievements(
  tx: DbTransaction,
  input: EvaluateAchievementsInput,
) {
  const authorIds = [...new Set(input.authorIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (authorIds.length === 0) return [];

  const requestedCodes = input.achievementCodes ? new Set(input.achievementCodes) : null;
  const definitions = getAchievementDefinitionsForEvent(input.eventType)
    .filter((definition) => !requestedCodes || requestedCodes.has(definition.code));
  if (definitions.length === 0) return [];

  const definitionCodes = definitions.map((definition) => definition.code);
  const [ratingRows, reviewRows, enabledAchievements, eligibleAuthors] = await Promise.all([
    tx
      .select({
        authorId: ratings.authorId,
        filmRatingsCount: sql<number>`count(*) filter (where ${mediaItems.mediaType} = 'film')::int`,
        gameRatingsCount: sql<number>`count(*) filter (where ${mediaItems.mediaType} = 'game')::int`,
        ratingsCount: sql<number>`count(*)::int`,
      })
      .from(ratings)
      .innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId))
      .where(and(
        inArray(ratings.authorId, authorIds),
        eq(mediaItems.publicationStatus, "published"),
      ))
      .groupBy(ratings.authorId),
    tx
      .select({ authorId: contributions.authorId })
      .from(contributions)
      .where(and(
        inArray(contributions.authorId, authorIds),
        eq(contributions.type, "review"),
        eq(contributions.status, "published"),
      ))
      .groupBy(contributions.authorId),
    tx
      .select({ code: achievements.code, id: achievements.id })
      .from(achievements)
      .where(and(
        eq(achievements.enabled, true),
        inArray(achievements.code, definitionCodes),
      )),
    tx
      .select({ id: authors.id })
      .from(authors)
      .where(and(
        inArray(authors.id, authorIds),
        eq(authors.isSystem, false),
        isNull(authors.blockedAt),
      )),
  ]);
  const ratingContextByAuthorId = new Map(ratingRows.map((row) => [row.authorId, row]));
  const authorsWithPublishedReview = new Set(reviewRows.map((row) => row.authorId));
  const achievementByCode = new Map(
    enabledAchievements.map((achievement) => [achievement.code as AchievementCode, achievement]),
  );
  const eligibleAuthorIds = new Set(eligibleAuthors.map((author) => author.id));
  const awards = authorIds.filter((authorId) => eligibleAuthorIds.has(authorId)).flatMap((authorId) => {
    const ratingsContext = ratingContextByAuthorId.get(authorId);
    const context: AchievementEvaluationContext = {
      filmRatingsCount: ratingsContext?.filmRatingsCount ?? 0,
      gameRatingsCount: ratingsContext?.gameRatingsCount ?? 0,
      hasPublishedReview: authorsWithPublishedReview.has(authorId),
      ratingsCount: ratingsContext?.ratingsCount ?? 0,
    };

    return definitions.flatMap((definition) => {
      const achievement = achievementByCode.get(definition.code);

      return achievement && definition.isSatisfied(context)
        ? [{
            achievementId: achievement.id,
            authorId,
            awardGroupId: input.awardGroupId,
            sourceEventId: input.sourceEventId ?? null,
          }]
        : [];
    });
  });

  if (awards.length === 0) return [];

  return tx
    .insert(userAchievements)
    .values(awards)
    .onConflictDoNothing({
      target: [userAchievements.authorId, userAchievements.achievementId],
    })
    .returning({
      achievementId: userAchievements.achievementId,
      authorId: userAchievements.authorId,
    });
}
