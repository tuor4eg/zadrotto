export const DOMAIN_EVENT_TYPES = [
  "rating.created",
  "review.published",
  "review.submitted",
  "review.approved",
  "friend.accepted",
  "quiz.completed",
  "media.published",
  "media.submitted",
  "media.approved",
  "media-franchise.published",
  "media-franchise.submitted",
  "media-franchise.approved",
  "media-franchise.removal.requested",
  "media-franchise.removal.approved",
  "franchise.parent.changed",
  "franchise.submitted",
  "franchise.approved",
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export type DomainEventPayloads = {
  "rating.created": { authorId: number; mediaItemId: number };
  "review.published": { authorId: number; mediaItemId: number };
  "review.submitted": { authorId: number; contributionId: number; mediaItemId: number };
  "review.approved": { authorId: number; contributionId: number; mediaItemId: number };
  "friend.accepted": {
    acceptedByAuthorId: number;
    friendshipId: number;
    requestedByAuthorId: number;
  };
  "quiz.completed": {
    authorId: number;
    outcome: "correct" | "exhausted";
    quizId: number;
  };
  "media.published": { mediaItemId: number };
  "media.submitted": { authorId: number; mediaItemId: number };
  "media.approved": { authorId: number; mediaItemId: number };
  "media-franchise.published": { franchiseId: number; mediaItemId: number };
  "media-franchise.submitted": { authorId: number; franchiseId: number; mediaItemId: number };
  "media-franchise.approved": { authorId: number; franchiseId: number; mediaItemId: number };
  "media-franchise.removal.requested": { authorId: number; franchiseId: number; mediaItemId: number };
  "media-franchise.removal.approved": { authorId: number; franchiseId: number; mediaItemId: number };
  "franchise.parent.changed": {
    franchiseId: number;
    nextParentId: number | null;
    previousParentId: number | null;
  };
  "franchise.submitted": { authorId: number; franchiseId: number };
  "franchise.approved": { authorId: number; franchiseId: number };
};

export type DomainEventInput<TType extends DomainEventType = DomainEventType> = {
  actorAuthorId: number | null;
  aggregateId: string;
  aggregateType: string;
  occurredAt?: Date;
  payload: DomainEventPayloads[TType];
  schemaVersion?: number;
  type: TType;
};

export type PersistedDomainEvent<TType extends DomainEventType = DomainEventType> = {
  actorAuthorId: number | null;
  aggregateId: string;
  aggregateType: string;
  id: string;
  occurredAt: Date;
  payload: DomainEventPayloads[TType];
  schemaVersion: number;
  type: TType;
};

export function isDomainEventType(value: string): value is DomainEventType {
  return (DOMAIN_EVENT_TYPES as readonly string[]).includes(value);
}
