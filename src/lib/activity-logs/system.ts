import "server-only";

import { createActivityLog } from "@/db/queries/activity-logs";
import {
  sanitizeActivityLogMetadata,
  type ActivityAction,
  type ActivitySeverity,
  type ActivityStatus,
} from "./model";

export async function logSystemActivity(input: {
  action: ActivityAction;
  entityId?: number | null;
  entityLabel?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
  severity?: ActivitySeverity;
  status?: ActivityStatus;
}) {
  try {
    await createActivityLog({
      action: input.action,
      actorType: "system",
      adminUserId: null,
      authorId: null,
      entityType: "media-item",
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      status: input.status ?? "success",
      severity: input.severity ?? "info",
      message: input.message,
      ipAddress: null,
      userAgent: null,
      metadata: sanitizeActivityLogMetadata(input.metadata),
    });
  } catch (error) {
    console.error("Failed to write system activity log", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}
