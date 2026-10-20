import { domainEventConsumerRegistry } from "../../src/lib/domain-events/registry";
import { dispatchDomainEvent } from "../../src/lib/domain-events/dispatcher";

domainEventConsumerRegistry.forType = () => [{ key: "test.crash", eventTypes: ["rating.created"],
  async handle() { process.exit(77); } }];
void dispatchDomainEvent(process.argv[2]).catch(() => process.exit(78));
