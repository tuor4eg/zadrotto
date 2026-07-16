import { and, desc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { adminActivityLogs, adminUsers, authors, mediaItems } from "@/db/schema";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import type {
  ActivityAction,
  ActivityActorType,
  ActivityEntityType,
  ActivitySeverity,
  ActivityStatus,
} from "@/lib/activity-logs/model";

export type ActivityLogFilters = {
  action?: ActivityAction | null;
  actorId?: number | null;
  actorType?: ActivityActorType | null;
  entityType?: ActivityEntityType | null;
  severity?: ActivitySeverity | null;
};

export async function createActivityLog(input: {
  action: ActivityAction;
  actorType: ActivityActorType;
  adminUserId: number | null;
  authorId: number | null;
  entityType: ActivityEntityType | null;
  entityId: number | null;
  entityLabel: string | null;
  status: ActivityStatus;
  severity: ActivitySeverity;
  message: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
}) {
  await db.insert(adminActivityLogs).values(input);
}

function getActivityLogFilterCondition(filters: ActivityLogFilters) {
  const conditions: SQL[] = [];

  if (filters.actorType) {
    conditions.push(eq(adminActivityLogs.actorType, filters.actorType));

    if (filters.actorId) {
      conditions.push(
        filters.actorType === "admin"
          ? eq(adminActivityLogs.adminUserId, filters.actorId)
          : eq(adminActivityLogs.authorId, filters.actorId),
      );
    }
  }

  if (filters.action) {
    conditions.push(eq(adminActivityLogs.action, filters.action));
  }

  if (filters.entityType) {
    conditions.push(eq(adminActivityLogs.entityType, filters.entityType));
  }

  if (filters.severity) {
    conditions.push(eq(adminActivityLogs.severity, filters.severity));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getAdminActivityLogs(input: ActivityLogFilters & {
  page: number;
  pageSize: number;
}) {
  const filterCondition = getActivityLogFilterCondition(input);
  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(adminActivityLogs)
    .where(filterCondition);
  const totalPages = getTotalPages(totalCount, input.pageSize);
  const page = clampPage(input.page, totalPages);
  const items = await db
    .select({
      id: adminActivityLogs.id,
      createdAt: adminActivityLogs.createdAt,
      actorType: adminActivityLogs.actorType,
      adminUserId: adminActivityLogs.adminUserId,
      adminLogin: adminUsers.login,
      authorId: adminActivityLogs.authorId,
      authorName: authors.name,
      action: adminActivityLogs.action,
      entityType: adminActivityLogs.entityType,
      entityId: adminActivityLogs.entityId,
      entityLabel: sql<string | null>`coalesce(${mediaItems.title}, ${adminActivityLogs.entityLabel})`,
      status: adminActivityLogs.status,
      severity: adminActivityLogs.severity,
      message: adminActivityLogs.message,
      ipAddress: adminActivityLogs.ipAddress,
      userAgent: adminActivityLogs.userAgent,
      metadata: adminActivityLogs.metadata,
    })
    .from(adminActivityLogs)
    .leftJoin(adminUsers, eq(adminUsers.id, adminActivityLogs.adminUserId))
    .leftJoin(authors, eq(authors.id, adminActivityLogs.authorId))
    .leftJoin(
      mediaItems,
      and(
        eq(adminActivityLogs.entityType, "media-item"),
        eq(mediaItems.id, adminActivityLogs.entityId),
      ),
    )
    .where(filterCondition)
    .orderBy(desc(adminActivityLogs.createdAt), desc(adminActivityLogs.id))
    .limit(input.pageSize)
    .offset(getOffset(page, input.pageSize));

  return {
    items,
    page,
    pageSize: input.pageSize,
    totalCount,
    totalPages,
  };
}
