import { ServerCog } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { checkMinioHealth } from "@/lib/services/minio";
import { checkPostgresHealth } from "@/lib/services/postgres";
import { checkRedisHealth } from "@/lib/services/redis";
import type { ServiceHealthCheck, ServiceHealthStatus } from "@/lib/services/health";
import { SettingsSectionHeader } from "../../settings/settings-section-header";

const STATUS_LABELS: Record<ServiceHealthStatus, string> = {
  healthy: "Работает",
  not_configured: "Не настроен",
  unhealthy: "Недоступен",
};

const STATUS_BADGE_VARIANTS: Record<
  ServiceHealthStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  healthy: "positive",
  not_configured: "warning",
  unhealthy: "destructive",
};

async function getServiceHealthChecks() {
  const healthChecks = await Promise.allSettled([
    checkPostgresHealth(),
    checkRedisHealth(),
    checkMinioHealth(),
  ]);

  return healthChecks.map((result, index): ServiceHealthCheck => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    const fallbackServices = [
      { code: "postgres", name: "PostgreSQL" },
      { code: "redis", name: "Redis" },
      { code: "minio", name: "MinIO / S3" },
    ] as const;
    const fallbackService = fallbackServices[index];

    return {
      ...fallbackService,
      status: "unhealthy",
      message:
        result.reason instanceof Error
          ? result.reason.message
          : "Проверка завершилась с ошибкой.",
      checkedAt: new Date().toISOString(),
      latencyMs: null,
    };
  });
}

function formatLatency(latencyMs: number | null) {
  return latencyMs === null ? "—" : `${latencyMs} мс`;
}

function formatCheckedAt(checkedAt: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(checkedAt));
}

export default async function AdminToolsServicesPage() {
  const serviceHealthChecks = await getServiceHealthChecks();

  return (
    <section>
      <SettingsSectionHeader
        icon={<ServerCog />}
        title="Сервисы"
        description="Состояние технических зависимостей приложения."
      />

      <div className="mt-5">
        <div className="grid gap-3 sm:hidden">
          {serviceHealthChecks.map((service) => (
            <div
              key={service.code}
              className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 font-medium text-stone-950">{service.name}</div>
                <Badge variant={STATUS_BADGE_VARIANTS[service.status]} className="shrink-0">
                  {STATUS_LABELS[service.status]}
                </Badge>
              </div>

              <p className="mt-3 break-words border-t border-stone-100 pt-3 text-sm leading-5 text-stone-600">
                {service.message}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-stone-100 pt-3">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                    Проверен
                  </div>
                  <div className="text-xs tabular-nums text-stone-500">
                    {formatCheckedAt(service.checkedAt)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                    Задержка
                  </div>
                  <div className="text-xs tabular-nums text-stone-500">
                    {formatLatency(service.latencyMs)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <TableWrap className="hidden sm:block">
          <Table>
            <THead>
              <TR>
                <TH>Сервис</TH>
                <TH>Статус</TH>
                <TH>Ответ</TH>
                <TH>Проверен</TH>
                <TH className="text-right">Задержка</TH>
              </TR>
            </THead>
            <TBody>
              {serviceHealthChecks.map((service) => (
                <TR key={service.code}>
                  <TD className="font-medium text-stone-950">{service.name}</TD>
                  <TD>
                    <Badge variant={STATUS_BADGE_VARIANTS[service.status]}>
                      {STATUS_LABELS[service.status]}
                    </Badge>
                  </TD>
                  <TD className="max-w-xl text-stone-600">{service.message}</TD>
                  <TD className="whitespace-nowrap text-stone-500">
                    {formatCheckedAt(service.checkedAt)}
                  </TD>
                  <TD className="whitespace-nowrap text-right text-stone-500">
                    {formatLatency(service.latencyMs)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </div>
    </section>
  );
}
