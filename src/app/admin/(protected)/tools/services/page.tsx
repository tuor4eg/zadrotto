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
        <TableWrap>
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
