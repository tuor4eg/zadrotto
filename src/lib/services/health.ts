export type ServiceHealthStatus = "healthy" | "unhealthy" | "not_configured";

export type ServiceHealthCheck = {
  code: string;
  name: string;
  status: ServiceHealthStatus;
  message: string;
  checkedAt: string;
  latencyMs: number | null;
};

type BuildHealthCheckInput = {
  code: string;
  name: string;
  status: ServiceHealthStatus;
  message: string;
  startedAt: number;
};

export function buildServiceHealthCheck(input: BuildHealthCheckInput): ServiceHealthCheck {
  return {
    code: input.code,
    name: input.name,
    status: input.status,
    message: input.message,
    checkedAt: new Date().toISOString(),
    latencyMs: Math.max(0, Date.now() - input.startedAt),
  };
}

export function buildMissingServiceConfigHealthCheck(input: {
  code: string;
  name: string;
  message: string;
}): ServiceHealthCheck {
  return {
    code: input.code,
    name: input.name,
    status: "not_configured",
    message: input.message,
    checkedAt: new Date().toISOString(),
    latencyMs: null,
  };
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Неизвестная ошибка.";
}
