import "server-only";

import { eq } from "drizzle-orm";

import { ratings } from "@/db/schema";
import type { DomainEventConsumer } from "@/lib/domain-events/registry";
import { evaluateAchievements } from "./service";

export const achievementDomainEventConsumer: DomainEventConsumer = {
  key: "achievements.evaluate",
  eventTypes: ["rating.created", "review.published", "media.published"],
  async handle(tx, event) {
    const authorIds = event.type === "media.published"
      ? (await tx
          .select({ authorId: ratings.authorId })
          .from(ratings)
          .where(eq(ratings.mediaItemId, (event.payload as { mediaItemId: number }).mediaItemId))
          .groupBy(ratings.authorId))
          .map((row) => row.authorId)
      : [(event.payload as { authorId: number }).authorId];

    await evaluateAchievements(tx, {
      authorIds,
      awardGroupId: event.id,
      eventType: event.type,
      sourceEventId: event.id,
    });
  },
};
