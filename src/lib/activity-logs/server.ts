"use server";

import { headers } from "next/headers";

import { createActivityLog, type CreateActivityLogInput } from "@/db/queries/activity-logs";
import {
  getDefaultActivitySeverity,
  isActivitySecurityAction,
  sanitizeActivityLogMetadata,
  type ActivityAction,
  type ActivityActorType,
  type ActivityEntityType,
  type ActivitySeverity,
  type ActivityStatus,
} from "@/lib/activity-logs/model";

export type LogActivityInput = {
  action: ActivityAction;
  actorType: ActivityActorType;
  adminUserId?: number | null;
  authorId?: number | null;
  entityType?: ActivityEntityType | null;
  entityId?: number | null;
  entityLabel?: string | null;
  status?: ActivityStatus;
  severity?: ActivitySeverity;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
};

function truncateHeaderValue(value: string | null, maxLength: number) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue.length > maxLength
    ? normalizedValue.slice(0, maxLength)
    : normalizedValue;
}

async function getSecurityRequestMetadata(action: ActivityAction) {
  if (!isActivitySecurityAction(action)) {
    return {
      ipAddress: null,
      userAgent: null,
    };
  }

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0] ?? null;

  return {
    ipAddress: truncateHeaderValue(forwardedFor ?? requestHeaders.get("x-real-ip"), 128),
    userAgent: truncateHeaderValue(requestHeaders.get("user-agent"), 512),
  };
}

export async function prepareActivityLog(input: LogActivityInput): Promise<CreateActivityLogInput> {
  const securityMetadata = await getSecurityRequestMetadata(input.action);
  const status = input.status ?? "success";

  return {
    action: input.action,
    actorType: input.actorType,
    adminUserId: input.adminUserId ?? null,
    authorId: input.authorId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    entityLabel: input.entityLabel ?? null,
    status,
    severity:
      input.severity ??
      getDefaultActivitySeverity({
        action: input.action,
        status,
      }),
    message: input.message ?? null,
    metadata: sanitizeActivityLogMetadata(input.metadata),
    ...securityMetadata,
  };
}

export async function logActivity(input: LogActivityInput) {
  try {
    await createActivityLog(await prepareActivityLog(input));
  } catch (error) {
    console.error("Failed to write activity log", error);
  }
}
