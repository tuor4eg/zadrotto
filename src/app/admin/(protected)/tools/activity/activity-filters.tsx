"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import {
  ACTIVITY_ACTION_LABELS,
  ACTIVITY_ACTIONS,
  ACTIVITY_ACTOR_TYPE_LABELS,
  ACTIVITY_ACTOR_TYPES,
  ACTIVITY_ENTITY_TYPE_LABELS,
  ACTIVITY_ENTITY_TYPES,
  ACTIVITY_SEVERITIES,
  ACTIVITY_SEVERITY_LABELS,
  type ActivityAction,
  type ActivityActorType,
  type ActivityEntityType,
  type ActivitySeverity,
} from "@/lib/activity-logs/model";

type ActivityFiltersProps = {
  action: ActivityAction | null;
  actorId: number | null;
  actorType: ActivityActorType | null;
  adminUsers: Array<{
    id: number;
    login: string;
  }>;
  authors: Array<{
    id: number;
    name: string;
  }>;
  entityType: ActivityEntityType | null;
  severity: ActivitySeverity | null;
  pageSize: number;
  shouldPersistPageSize: boolean;
};

type ActivityFilterPatch = {
  action?: ActivityAction | null;
  actorId?: number | null;
  actorType?: ActivityActorType | null;
  entityType?: ActivityEntityType | null;
  severity?: ActivitySeverity | null;
};

function buildActivityUrl(input: {
  action: ActivityAction | null;
  actorId: number | null;
  actorType: ActivityActorType | null;
  entityType: ActivityEntityType | null;
  severity: ActivitySeverity | null;
  pageSize: number;
  shouldPersistPageSize: boolean;
}) {
  const params = new URLSearchParams();

  if (input.actorType) {
    params.set("actor", input.actorType);
  }

  if (input.actorType && input.actorId) {
    params.set("actorId", String(input.actorId));
  }

  if (input.action) {
    params.set("action", input.action);
  }

  if (input.entityType) {
    params.set("entity", input.entityType);
  }

  if (input.severity) {
    params.set("severity", input.severity);
  }

  if (input.shouldPersistPageSize) {
    params.set("pageSize", String(input.pageSize));
  }

  const query = params.toString();

  return query ? `/admin/tools/activity?${query}` : "/admin/tools/activity";
}

export function ActivityFilters({
  action,
  actorId,
  actorType,
  adminUsers,
  authors,
  entityType,
  pageSize,
  severity,
  shouldPersistPageSize,
}: ActivityFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedActorType, setSelectedActorType] = useState(actorType);
  const [selectedActorId, setSelectedActorId] = useState(actorId);
  const [selectedAction, setSelectedAction] = useState(action);
  const [selectedEntityType, setSelectedEntityType] = useState(entityType);
  const [selectedSeverity, setSelectedSeverity] = useState(severity);

  function applyFilters(nextFilters: ActivityFilterPatch) {
    const nextActorType = "actorType" in nextFilters
      ? (nextFilters.actorType ?? null)
      : selectedActorType;
    const nextActorId = "actorId" in nextFilters
      ? (nextFilters.actorId ?? null)
      : selectedActorId;
    const nextUrl = buildActivityUrl({
      action: "action" in nextFilters ? (nextFilters.action ?? null) : selectedAction,
      actorId: nextActorType ? nextActorId : null,
      actorType: nextActorType,
      entityType: "entityType" in nextFilters
        ? (nextFilters.entityType ?? null)
        : selectedEntityType,
      severity: "severity" in nextFilters ? (nextFilters.severity ?? null) : selectedSeverity,
      pageSize,
      shouldPersistPageSize,
    });

    startTransition(() => {
      router.push(nextUrl);
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
      <Select
        value={selectedActorType ?? ""}
        aria-label="Фильтр по участнику"
        onChange={(event) => {
          const nextActorType = event.target.value
            ? (event.target.value as ActivityActorType)
            : null;

          setSelectedActorType(nextActorType);
          setSelectedActorId(null);
          applyFilters({ actorId: null, actorType: nextActorType });
        }}
      >
        <option value="">Все участники</option>
        {ACTIVITY_ACTOR_TYPES.map((actorTypeValue) => (
          <option key={actorTypeValue} value={actorTypeValue}>
            {ACTIVITY_ACTOR_TYPE_LABELS[actorTypeValue]}
          </option>
        ))}
      </Select>

      {selectedActorType === "admin" ? (
        <Select
          value={selectedActorId?.toString() ?? ""}
          aria-label="Фильтр по админу"
          onChange={(event) => {
            const nextActorId = event.target.value ? Number(event.target.value) : null;

            setSelectedActorId(nextActorId);
            applyFilters({ actorId: nextActorId });
          }}
        >
          <option value="">Все админы</option>
          {adminUsers.map((adminUser) => (
            <option key={adminUser.id} value={adminUser.id}>
              {adminUser.login}
            </option>
          ))}
        </Select>
      ) : null}

      {selectedActorType === "author" ? (
        <Select
          value={selectedActorId?.toString() ?? ""}
          aria-label="Фильтр по автору"
          onChange={(event) => {
            const nextActorId = event.target.value ? Number(event.target.value) : null;

            setSelectedActorId(nextActorId);
            applyFilters({ actorId: nextActorId });
          }}
        >
          <option value="">Все авторы</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
            </option>
          ))}
        </Select>
      ) : null}

      <Select
        value={selectedAction ?? ""}
        aria-label="Фильтр по действию"
        onChange={(event) => {
          const nextAction = event.target.value ? (event.target.value as ActivityAction) : null;

          setSelectedAction(nextAction);
          applyFilters({ action: nextAction });
        }}
      >
        <option value="">Все действия</option>
        {ACTIVITY_ACTIONS.map((actionValue) => (
          <option key={actionValue} value={actionValue}>
            {ACTIVITY_ACTION_LABELS[actionValue]}
          </option>
        ))}
      </Select>

      <Select
        value={selectedEntityType ?? ""}
        aria-label="Фильтр по сущности"
        onChange={(event) => {
          const nextEntityType = event.target.value
            ? (event.target.value as ActivityEntityType)
            : null;

          setSelectedEntityType(nextEntityType);
          applyFilters({ entityType: nextEntityType });
        }}
      >
        <option value="">Все сущности</option>
        {ACTIVITY_ENTITY_TYPES.map((entityTypeValue) => (
          <option key={entityTypeValue} value={entityTypeValue}>
            {ACTIVITY_ENTITY_TYPE_LABELS[entityTypeValue]}
          </option>
        ))}
      </Select>

      <Select
        value={selectedSeverity ?? ""}
        aria-label="Фильтр по важности"
        onChange={(event) => {
          const nextSeverity = event.target.value
            ? (event.target.value as ActivitySeverity)
            : null;

          setSelectedSeverity(nextSeverity);
          applyFilters({ severity: nextSeverity });
        }}
      >
        <option value="">Любая важность</option>
        {ACTIVITY_SEVERITIES.map((severityValue) => (
          <option key={severityValue} value={severityValue}>
            {ACTIVITY_SEVERITY_LABELS[severityValue]}
          </option>
        ))}
      </Select>

      <Link href="/admin/tools/activity" className={buttonVariants({ variant: "outline" })}>
        Сбросить
      </Link>

      {isPending ? (
        <div
          className="flex items-center gap-2 text-xs font-medium text-stone-500 md:col-span-full"
          aria-live="polite"
        >
          <LoaderCircle className="size-3.5 animate-spin" />
          Обновляю журнал...
        </div>
      ) : null}
    </div>
  );
}
