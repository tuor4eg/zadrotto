import "server-only";

import { createJobRun } from "@/db/queries/jobs";
import {
  DEFAULT_JOB_MAX_ATTEMPTS,
  DEFAULT_JOB_RETRY_BASE_SECONDS,
  DEFAULT_JOB_RETRY_MAX_SECONDS,
  DEFAULT_JOB_TIMEOUT_SECONDS,
} from "@/lib/jobs/model";

export async function enqueueDomainEventDispatch(eventId: string) {
  try {
    await createJobRun({
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
      payload: { eventId },
      retryBaseSeconds: DEFAULT_JOB_RETRY_BASE_SECONDS,
      retryMaxSeconds: DEFAULT_JOB_RETRY_MAX_SECONDS,
      source: "event",
      timeoutSeconds: DEFAULT_JOB_TIMEOUT_SECONDS,
      type: "domain-events.dispatch",
    });
  } catch (error) {
    // The transactional outbox remains the delivery guarantee; this job is only a fast path.
    console.error("Failed to enqueue immediate domain event dispatch", { error, eventId });
  }
}
