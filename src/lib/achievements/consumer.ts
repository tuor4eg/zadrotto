import "server-only";

import { sql } from "drizzle-orm";

import { contributions, franchises, mediaItemFranchises, ratings } from "@/db/schema";
import type { DomainEventConsumer } from "@/lib/domain-events/registry";
import { evaluateAchievements } from "./service";

export const achievementDomainEventConsumer: DomainEventConsumer = {
  key: "achievements.evaluate",
  eventTypes: [
    "rating.created",
    "review.published",
    "media.published",
    "media-franchise.published",
    "franchise.parent.changed",
  ],
  async handle(tx, event) {
    let authorIds: number[];
    if (event.type === "rating.created" || event.type === "review.published") {
      authorIds = [(event.payload as { authorId: number }).authorId];
    } else {
      const mediaIds = event.type === "franchise.parent.changed"
        ? sql`select distinct links.media_item_id
            from ${mediaItemFranchises} links
            where links.publication_status = 'published' and links.franchise_id in (
              with recursive subtree as (
                select ${franchises.id} from ${franchises} where ${franchises.id} = ${(event.payload as { franchiseId: number }).franchiseId}
                union all
                select child.id from ${franchises} child inner join subtree parent on child.parent_id = parent.id
              ) select id from subtree
            )`
        : sql`select ${(event.payload as { mediaItemId: number }).mediaItemId}::int as media_item_id`;
      const rows = await tx.execute(sql`
        select distinct affected.author_id as "authorId" from (
          select ${ratings.authorId} as author_id from ${ratings}
            where ${ratings.mediaItemId} in (${mediaIds})
          union
          select ${contributions.authorId} as author_id from ${contributions}
            where ${contributions.primaryMediaItemId} in (${mediaIds})
              and ${contributions.type} = 'review' and ${contributions.status} = 'published'
        ) affected
      `);
      authorIds = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => Number(row.authorId));
    }

    await evaluateAchievements(tx, {
      authorIds,
      awardGroupId: event.id,
      eventType: event.type,
      sourceEventId: event.id,
    });
  },
};
