import { Activity } from "lucide-react";
import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getAdminActivityLogs } from "@/db/queries/activity-logs";
import { getAdminUserOptions } from "@/db/queries/admin-users";
import { getAuthorOptions } from "@/db/queries/authors";
import {
  ACTIVITY_SEVERITY_LABELS,
  ACTIVITY_STATUS_LABELS,
  getActivityActionLabel,
  getActivityEntityTypeLabel,
  isActivityAction,
  isActivityActorType,
  isActivityEntityType,
  isActivitySeverity,
  type ActivityAction,
  type ActivityActorType,
  type ActivityEntityType,
  type ActivitySeverity,
} from "@/lib/activity-logs/model";
import { parsePage, parsePageSize } from "@/lib/common/pagination";
import { EmptyState } from "../../admin-ui";
import { SettingsSectionHeader } from "../../settings/settings-section-header";
import { ActivityFilters } from "./activity-filters";
import { ActivityLogTime } from "./activity-log-time";

type AdminActivityPageProps = {
  searchParams: Promise<{
    action?: string;
    actor?: string;
    actorId?: string;
    entity?: string;
    page?: string;
    pageSize?: string;
    severity?: string;
  }>;
};

const ACTIVITY_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_ACTIVITY_PAGE_SIZE = 50;
type ActivityLogItem = Awaited<ReturnType<typeof getAdminActivityLogs>>["items"][number];

function parseActorFilter(value: string | undefined): ActivityActorType | null {
  return value && isActivityActorType(value) ? value : null;
}

function parseActionFilter(value: string | undefined): ActivityAction | null {
  return value && isActivityAction(value) ? value : null;
}

function parseEntityFilter(value: string | undefined): ActivityEntityType | null {
  return value && isActivityEntityType(value) ? value : null;
}

function parseSeverityFilter(value: string | undefined): ActivitySeverity | null {
  return value && isActivitySeverity(value) ? value : null;
}

function parseActorIdFilter(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function getActorLabel(item: ActivityLogItem) {
  if (item.actorType === "admin") {
    return item.adminLogin ? `Админ: ${item.adminLogin}` : "Админ";
  }

  return item.authorName ? `Автор: ${item.authorName}` : "Автор";
}

function getActivityEntityAdminHref(input: {
  entityId: number | null;
  entityType: string | null;
}) {
  switch (input.entityType) {
    case "access-profile":
      return input.entityId ? `/admin/access-profiles/${input.entityId}/edit` : null;
    case "author":
      return input.entityId ? `/admin/authors/${input.entityId}/edit` : null;
    case "author-token":
      return "/admin/author-tokens";
    case "cover-provider":
      return "/admin/tools/providers";
    case "cover-settings":
      return "/admin/tools/providers/limits";
    case "franchise":
      return input.entityId ? `/admin/franchises/${input.entityId}/edit` : null;
    case "media-item":
      return input.entityId ? `/admin/media/${input.entityId}/edit` : null;
    case "review":
      return input.entityId ? `/admin/reviews/${input.entityId}` : null;
    default:
      return null;
  }
}

function getStatusBadgeVariant(status: string) {
  return status === "success" ? "positive" as const : "destructive" as const;
}

function getSeverityBadgeVariant(severity: string) {
  return severity === "critical"
    ? "destructive" as const
    : severity === "warning"
      ? "warning" as const
      : "outline" as const;
}

function ActivityLogDetails({
  item,
}: {
  item: ActivityLogItem;
}) {
  const entityTypeLabel = getActivityEntityTypeLabel(item.entityType);

  return (
    <div className="grid gap-1 text-xs leading-5 text-stone-500">
      {item.entityType ? (
        <div>
          {entityTypeLabel}:{" "}
          <ActivityEntityLabel item={item} className="text-stone-700" />
        </div>
      ) : null}
      {item.message ? <div className="text-stone-600">{item.message}</div> : null}
      {item.ipAddress || item.userAgent ? (
        <div className="break-words">
          {[item.ipAddress ? `IP: ${item.ipAddress}` : null, item.userAgent]
            .filter(Boolean)
            .join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

function ActivityEntityLabel({
  className,
  item,
}: {
  className?: string;
  item: ActivityLogItem;
}) {
  const label = item.entityLabel ?? (item.entityId ? `#${item.entityId}` : "—");
  const href = getActivityEntityAdminHref({
    entityId: item.entityId,
    entityType: item.entityType,
  });

  if (!href) {
    return <span className={className}>{label}</span>;
  }

  return (
    <Link
      className={className ? `${className} underline-offset-2 hover:underline` : undefined}
      href={href}
    >
      {label}
    </Link>
  );
}

export default async function AdminActivityPage({ searchParams }: AdminActivityPageProps) {
  const params = await searchParams;
  const actorType = parseActorFilter(params.actor);
  const actorId = actorType ? parseActorIdFilter(params.actorId) : null;
  const action = parseActionFilter(params.action);
  const entityType = parseEntityFilter(params.entity);
  const severity = parseSeverityFilter(params.severity);
  const pageSize = parsePageSize(
    params.pageSize,
    ACTIVITY_PAGE_SIZE_OPTIONS,
    DEFAULT_ACTIVITY_PAGE_SIZE,
  );
  const [adminUsers, authors, logs] = await Promise.all([
    getAdminUserOptions(),
    getAuthorOptions(),
    getAdminActivityLogs({
      action,
      actorId,
      actorType,
      entityType,
      page: parsePage(params.page),
      pageSize,
      severity,
    }),
  ]);
  const searchParamsForPagination = {
    action: action ?? undefined,
    actor: actorType ?? undefined,
    actorId: actorType && actorId ? String(actorId) : undefined,
    entity: entityType ?? undefined,
    pageSize: pageSize !== DEFAULT_ACTIVITY_PAGE_SIZE ? String(pageSize) : undefined,
    severity: severity ?? undefined,
  };

  return (
    <section>
      <SettingsSectionHeader
        icon={<Activity />}
        title="Журнал"
        description="Важные действия админов и авторов."
      />

      <div className="mt-5 grid gap-5">
        <ActivityFilters
          action={action}
          actorId={actorId}
          actorType={actorType}
          adminUsers={adminUsers}
          authors={authors}
          entityType={entityType}
          pageSize={pageSize}
          severity={severity}
          shouldPersistPageSize={pageSize !== DEFAULT_ACTIVITY_PAGE_SIZE}
        />

        {logs.totalCount === 0 ? (
          <EmptyState>Записей журнала пока нет.</EmptyState>
        ) : (
          <>
            <div className="grid gap-3 sm:hidden">
              {logs.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-stone-950">
                        {getActivityActionLabel(item.action)}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        <ActivityLogTime value={item.createdAt.toISOString()} />
                      </div>
                    </div>
                    <Badge variant={getStatusBadgeVariant(item.status)}>
                      {ACTIVITY_STATUS_LABELS[item.status as keyof typeof ACTIVITY_STATUS_LABELS] ??
                        item.status}
                    </Badge>
                  </div>
                  <div className="mt-3 border-t border-stone-100 pt-3">
                    <div className="mb-2 text-sm text-stone-700">{getActorLabel(item)}</div>
                    <Badge className="mb-2" variant={getSeverityBadgeVariant(item.severity)}>
                      {ACTIVITY_SEVERITY_LABELS[
                        item.severity as keyof typeof ACTIVITY_SEVERITY_LABELS
                      ] ?? item.severity}
                    </Badge>
                    <ActivityLogDetails item={item} />
                  </div>
                </div>
              ))}
            </div>

            <TableWrap className="hidden sm:block">
              <Table>
                <THead>
                  <TR>
                    <TH>Время</TH>
                    <TH>Участник</TH>
                    <TH>Действие</TH>
                    <TH>Сущность</TH>
                    <TH>Важность</TH>
                    <TH>Статус</TH>
                    <TH>Детали</TH>
                  </TR>
                </THead>
                <TBody>
                  {logs.items.map((item) => (
                    <TR key={item.id}>
                      <TD className="whitespace-nowrap text-stone-500">
                        <ActivityLogTime value={item.createdAt.toISOString()} />
                      </TD>
                      <TD className="whitespace-nowrap text-stone-700">{getActorLabel(item)}</TD>
                      <TD className="font-medium text-stone-950">
                        {getActivityActionLabel(item.action)}
                      </TD>
                      <TD className="text-stone-600">
                        {item.entityType ? (
                          <>
                            <div>{getActivityEntityTypeLabel(item.entityType)}</div>
                            <ActivityEntityLabel
                              item={item}
                              className="mt-1 block max-w-48 truncate text-xs text-stone-500"
                            />
                          </>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD>
                        <Badge variant={getSeverityBadgeVariant(item.severity)}>
                          {ACTIVITY_SEVERITY_LABELS[
                            item.severity as keyof typeof ACTIVITY_SEVERITY_LABELS
                          ] ?? item.severity}
                        </Badge>
                      </TD>
                      <TD>
                        <Badge variant={getStatusBadgeVariant(item.status)}>
                          {ACTIVITY_STATUS_LABELS[item.status as keyof typeof ACTIVITY_STATUS_LABELS] ??
                            item.status}
                        </Badge>
                      </TD>
                      <TD>
                        <ActivityLogDetails item={item} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>

            <PaginationNav
              basePath="/admin/tools/activity"
              itemLabel="событий"
              page={logs.page}
              pageSize={logs.pageSize}
              pageSizeOptions={ACTIVITY_PAGE_SIZE_OPTIONS}
              searchParams={searchParamsForPagination}
              showPageJump
              totalCount={logs.totalCount}
              totalPages={logs.totalPages}
            />
          </>
        )}
      </div>
    </section>
  );
}
