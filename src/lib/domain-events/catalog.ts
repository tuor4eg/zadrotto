export const DOMAIN_EVENT_TYPES = [
  "rating.created",
  "review.published",
  "friend.accepted",
  "media.published",
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export type DomainEventPayloads = {
  "rating.created": { authorId: number; mediaItemId: number };
  "review.published": { authorId: number; mediaItemId: number };
  "friend.accepted": {
    acceptedByAuthorId: number;
    friendshipId: number;
    requestedByAuthorId: number;
  };
  "media.published": { mediaItemId: number };
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
