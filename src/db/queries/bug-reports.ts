import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { adminActivityLogs, adminUsers, authors, bugReports } from "@/db/schema";
import { runInDomainEventTransaction } from "@/db/transaction";
import {
  canTransitionBugReportStatus,
  type BugReportClientContext,
  type BugReportEntityType,
  type BugReportStatus,
} from "@/lib/bug-reports/model";
import type { CreateActivityLogInput } from "@/db/queries/activity-logs";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";

export type CreateBugReportInput = {
  authorId: number;
  clientContext: BugReportClientContext | null;
  description: string;
  entityId: string | null;
  entityType: BugReportEntityType | null;
  url: string;
};

export async function createBugReport(input: CreateBugReportInput) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const [report] = await tx
      .insert(bugReports)
      .values(input)
      .returning({ id: bugReports.id });
    if (!report) throw new Error("Bug report was not created");

    await appendEvent({
      actorAuthorId: input.authorId,
      aggregateId: String(report.id),
      aggregateType: "bug-report",
      payload: { authorId: input.authorId, bugReportId: report.id },
      type: "bug-report.created",
    });
    return report;
  });
}

export async function getBugReportById(id: number) {
  const [report] = await db
    .select({
      id: bugReports.id,
      authorId: bugReports.authorId,
      authorName: authors.name,
      description: bugReports.description,
      url: bugReports.url,
      entityType: bugReports.entityType,
      entityId: bugReports.entityId,
      status: bugReports.status,
      clientContext: bugReports.clientContext,
      confirmedAt: bugReports.confirmedAt,
      resolvedAt: bugReports.resolvedAt,
      resolvedByAdminId: bugReports.resolvedByAdminId,
      resolvedByAdminLogin: adminUsers.login,
      createdAt: bugReports.createdAt,
      updatedAt: bugReports.updatedAt,
    })
    .from(bugReports)
    .innerJoin(authors, eq(authors.id, bugReports.authorId))
    .leftJoin(adminUsers, eq(adminUsers.id, bugReports.resolvedByAdminId))
    .where(eq(bugReports.id, id))
    .limit(1);
  return report ?? null;
}

export async function getBugReports(input: {
  limit: number;
  offset: number;
  status?: BugReportStatus | null;
}) {
  const condition = input.status ? eq(bugReports.status, input.status) : undefined;
  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(bugReports)
    .where(condition);
  const items = await db
    .select({
      id: bugReports.id,
      authorId: bugReports.authorId,
      authorName: authors.name,
      description: bugReports.description,
      entityType: bugReports.entityType,
      entityId: bugReports.entityId,
      status: bugReports.status,
      createdAt: bugReports.createdAt,
    })
    .from(bugReports)
    .innerJoin(authors, eq(authors.id, bugReports.authorId))
    .where(condition)
    .orderBy(desc(bugReports.createdAt), desc(bugReports.id))
    .limit(input.limit)
    .offset(input.offset);
  return { items, totalCount };
}

export async function countOpenBugReports() {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bugReports)
    .where(sql`${bugReports.status} not in ('fixed', 'rejected')`);
  return row?.count ?? 0;
}

export async function listAdminBugReports(input: {
  page: number;
  pageSize: number;
  status?: BugReportStatus | null;
}) {
  const pageSize = Math.max(1, Math.min(input.pageSize, 100));
  const firstPass = await getBugReports({ limit: pageSize, offset: 0, status: input.status });
  const totalPages = getTotalPages(firstPass.totalCount, pageSize);
  const page = clampPage(input.page, totalPages);
  const result = page === 1
    ? firstPass
    : await getBugReports({ limit: pageSize, offset: getOffset(page, pageSize), status: input.status });
  return { ...result, page, pageSize, totalPages };
}

export const getAdminBugReportById = getBugReportById;
export const getOpenBugReportCount = countOpenBugReports;

export async function getBugReportActivityLogs(id: number) {
  return db
    .select({
      action: adminActivityLogs.action,
      adminLogin: adminUsers.login,
      adminUserId: adminActivityLogs.adminUserId,
      createdAt: adminActivityLogs.createdAt,
      message: adminActivityLogs.message,
      metadata: adminActivityLogs.metadata,
    })
    .from(adminActivityLogs)
    .leftJoin(adminUsers, eq(adminUsers.id, adminActivityLogs.adminUserId))
    .where(and(eq(adminActivityLogs.entityType, "bug-report"), eq(adminActivityLogs.entityId, id)))
    .orderBy(desc(adminActivityLogs.createdAt), desc(adminActivityLogs.id));
}

const STATUS_ACTIVITY_ACTION: Record<BugReportStatus, CreateActivityLogInput["action"]> = {
  new: "bug-report.created",
  reviewing: "bug-report.reviewing",
  confirmed: "bug-report.confirmed",
  fixed: "bug-report.fixed",
  rejected: "bug-report.rejected",
};

export class BugReportTransitionError extends Error {
  constructor(public readonly code: "not-found" | "stale-status" | "invalid-transition") {
    super(code);
  }
}

export async function transitionBugReportStatus(input: {
  activityLog: Omit<CreateActivityLogInput, "action" | "entityId" | "entityLabel" | "entityType" | "message" | "metadata">;
  adminId: number;
  expectedStatus?: BugReportStatus;
  id: number;
  status: BugReportStatus;
}) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    await tx.execute(sql`select ${bugReports.id} from ${bugReports} where ${bugReports.id} = ${input.id} for update`);
    const [current] = await tx
      .select({ authorId: bugReports.authorId, confirmedAt: bugReports.confirmedAt, status: bugReports.status })
      .from(bugReports)
      .where(eq(bugReports.id, input.id))
      .limit(1);
    if (!current) throw new BugReportTransitionError("not-found");
    if (input.expectedStatus && current.status !== input.expectedStatus) {
      throw new BugReportTransitionError("stale-status");
    }
    const currentStatus = current.status as BugReportStatus;
    if (!canTransitionBugReportStatus(currentStatus, input.status)) {
      throw new BugReportTransitionError("invalid-transition");
    }

    const now = new Date();
    const isClosing = input.status === "fixed" || input.status === "rejected";
    const firstConfirmation = input.status === "confirmed" && current.confirmedAt === null;
    const [updated] = await tx
      .update(bugReports)
      .set({
        status: input.status,
        confirmedAt: firstConfirmation ? now : current.confirmedAt,
        resolvedAt: isClosing ? now : null,
        resolvedByAdminId: isClosing ? input.adminId : null,
        updatedAt: now,
      })
      .where(and(eq(bugReports.id, input.id), eq(bugReports.status, currentStatus)))
      .returning({ id: bugReports.id });
    if (!updated) throw new BugReportTransitionError("stale-status");

    await tx.insert(adminActivityLogs).values({
      ...input.activityLog,
      action: STATUS_ACTIVITY_ACTION[input.status],
      adminUserId: input.adminId,
      entityId: input.id,
      entityLabel: `Багрепорт #${input.id}`,
      entityType: "bug-report",
      message: `Статус изменён: ${currentStatus} → ${input.status}.`,
      metadata: { fromStatus: currentStatus, toStatus: input.status },
    });

    if (firstConfirmation) {
      await appendEvent({
        actorAuthorId: null,
        aggregateId: String(input.id),
        aggregateType: "bug-report",
        payload: { authorId: current.authorId, bugReportId: input.id },
        type: "bug-report.confirmed",
      });
    }
    return { id: input.id, status: input.status };
  });
}

export async function transitionBugReport(input: {
  adminUserId: number;
  bugReportId: number;
  expectedStatus?: BugReportStatus;
  nextStatus: BugReportStatus;
}) {
  return transitionBugReportStatus({
    activityLog: {
      actorType: "admin",
      adminUserId: input.adminUserId,
      authorId: null,
      ipAddress: null,
      severity: "info",
      status: "success",
      userAgent: null,
    },
    adminId: input.adminUserId,
    expectedStatus: input.expectedStatus,
    id: input.bugReportId,
    status: input.nextStatus,
  });
}
