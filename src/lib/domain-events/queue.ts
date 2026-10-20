import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import "server-only";

import { createJobRun } from "@/db/queries/jobs";
import {
  DEFAULT_JOB_MAX_ATTEMPTS,
  DEFAULT_JOB_RETRY_BASE_SECONDS,
  DEFAULT_JOB_RETRY_MAX_SECONDS,
  DEFAULT_JOB_TIMEOUT_SECONDS,
} from "@/lib/jobs/model";

export async function enqueueDomainEventDispatch(eventId: string, jobGuard?: SnapshotJobGuard) {
  try {
    await withSnapshotJobGuard(jobGuard, tx => createJobRun({
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
      payload: { eventId },
      retryBaseSeconds: DEFAULT_JOB_RETRY_BASE_SECONDS,
      retryMaxSeconds: DEFAULT_JOB_RETRY_MAX_SECONDS,
      source: "event",
      timeoutSeconds: DEFAULT_JOB_TIMEOUT_SECONDS,
      type: "domain-events.dispatch",
    }, new Date(), tx));
  } catch (error) {
    // The transactional outbox remains the delivery guarantee; this job is only a fast path.
    console.error("Failed to enqueue immediate domain event dispatch", { error, eventId });
  }
}

export async function enqueueNotificationTransportDelivery(jobGuard?: SnapshotJobGuard) {
  try {
    await withSnapshotJobGuard(jobGuard, tx => createJobRun({
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
      payload: {},
      retryBaseSeconds: DEFAULT_JOB_RETRY_BASE_SECONDS,
      retryMaxSeconds: DEFAULT_JOB_RETRY_MAX_SECONDS,
      source: "event",
      timeoutSeconds: DEFAULT_JOB_TIMEOUT_SECONDS,
      type: "notifications.transport-delivery",
    }, new Date(), tx));
  } catch (error) {
    // The scheduled scanner remains the delivery guarantee; this job is only a fast path.
    console.error("Failed to enqueue immediate notification transport delivery", { error });
  }
}
