import { JobError } from "@/lib/jobs/types";
import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import "server-only";

import { createActivityLog } from "@/db/queries/activity-logs";
import {
  sanitizeActivityLogMetadata,
  type ActivityAction,
  type ActivityEntityType,
  type ActivitySeverity,
  type ActivityStatus,
} from "./model";

export async function logSystemActivity(input: {
  action: ActivityAction;
  jobGuard?: SnapshotJobGuard;
  entityId?: number | null;
  entityType?: ActivityEntityType;
  entityLabel?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
  severity?: ActivitySeverity;
  status?: ActivityStatus;
}) {
  try {
    const write = (executor?: Parameters<typeof createActivityLog>[1]) => createActivityLog({
      action: input.action,
      actorType: "system",
      adminUserId: null,
      authorId: null,
      entityType: input.entityType ?? "media-item",
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      status: input.status ?? "success",
      severity: input.severity ?? "info",
      message: input.message,
      ipAddress: null,
      userAgent: null,
      metadata: sanitizeActivityLogMetadata(input.metadata),
    }, executor);
    if (input.jobGuard) await withSnapshotJobGuard(input.jobGuard, tx => write(tx));
    else await write();
  } catch (error) {
    if (error instanceof JobError && error.code === "lease-lost") throw error;
    console.error("Failed to write system activity log", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}
