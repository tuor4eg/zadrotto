import type { DbTransaction } from "@/db/transaction";
import { achievementDomainEventConsumer } from "@/lib/achievements/consumer";
import type { DomainEventType, PersistedDomainEvent } from "./catalog";

export type DomainEventConsumer<TType extends DomainEventType = DomainEventType> = {
  eventTypes: readonly TType[];
  handle: (tx: DbTransaction, event: PersistedDomainEvent<TType>) => Promise<void>;
  key: string;
};

export function createDomainEventConsumerRegistry(
  consumers: readonly DomainEventConsumer[],
) {
  const keys = new Set<string>();
  const byType = new Map<DomainEventType, DomainEventConsumer[]>();

  for (const consumer of consumers) {
    const key = consumer.key.trim();
    if (!key || keys.has(key)) throw new Error(`Duplicate or empty domain event consumer: ${key}`);
    keys.add(key);

    for (const type of consumer.eventTypes) {
      const registered = byType.get(type) ?? [];
      registered.push(consumer);
      byType.set(type, registered);
    }
  }

  return {
    forType(type: DomainEventType) {
      return byType.get(type) ?? [];
    },
  };
}

// Consumers are infrastructure plugins: adding one here does not change event producers.
export const domainEventConsumerRegistry = createDomainEventConsumerRegistry([
  achievementDomainEventConsumer,
]);
