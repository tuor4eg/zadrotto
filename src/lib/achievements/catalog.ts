import type { DomainEventType } from "@/lib/domain-events/catalog";

export const ACHIEVEMENT_CODES = [
  "first-rating",
  "ratings-10",
  "games-rated-10",
  "films-rated-10",
  "first-published-review",
] as const;

export type AchievementCode = (typeof ACHIEVEMENT_CODES)[number];

export type AchievementEvaluationContext = {
  filmRatingsCount: number;
  gameRatingsCount: number;
  hasPublishedReview: boolean;
  ratingsCount: number;
};

export type AchievementDefinition = {
  code: AchievementCode;
  eventTypes: readonly DomainEventType[];
  isSatisfied: (context: AchievementEvaluationContext) => boolean;
};

const RATING_EVENT_TYPES = ["rating.created", "media.published"] as const;

export const achievementRegistry: readonly AchievementDefinition[] = [
  {
    code: "first-rating",
    eventTypes: RATING_EVENT_TYPES,
    isSatisfied: ({ ratingsCount }) => ratingsCount >= 1,
  },
  {
    code: "ratings-10",
    eventTypes: RATING_EVENT_TYPES,
    isSatisfied: ({ ratingsCount }) => ratingsCount >= 10,
  },
  {
    code: "games-rated-10",
    eventTypes: RATING_EVENT_TYPES,
    isSatisfied: ({ gameRatingsCount }) => gameRatingsCount >= 10,
  },
  {
    code: "films-rated-10",
    eventTypes: RATING_EVENT_TYPES,
    isSatisfied: ({ filmRatingsCount }) => filmRatingsCount >= 10,
  },
  {
    code: "first-published-review",
    eventTypes: ["review.published"],
    isSatisfied: ({ hasPublishedReview }) => hasPublishedReview,
  },
];

export function getAchievementDefinitionsForEvent(type?: DomainEventType) {
  return type
    ? achievementRegistry.filter((definition) => definition.eventTypes.includes(type))
    : achievementRegistry;
}
