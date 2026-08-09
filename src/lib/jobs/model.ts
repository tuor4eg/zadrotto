export const JOB_RUN_SOURCES = ["schedule", "manual", "event"] as const;
export const JOB_RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type JobRunSource = (typeof JOB_RUN_SOURCES)[number];
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export const DEFAULT_JOB_MAX_ATTEMPTS = 3;
export const DEFAULT_JOB_TIMEOUT_SECONDS = 300;
export const DEFAULT_JOB_RETRY_BASE_SECONDS = 60;
export const DEFAULT_JOB_RETRY_MAX_SECONDS = 3600;
export const DEFAULT_JOB_HISTORY_RETENTION_DAYS = 30;
export const MIN_JOB_HISTORY_RETENTION_DAYS = 1;
export const MAX_JOB_HISTORY_RETENTION_DAYS = 365;
export const AD_HOC_JOB_HISTORY_RETENTION_DAYS = 30;

export function calculateJobRetryDelaySeconds(input: {
  attempts: number;
  baseSeconds: number;
  maxSeconds: number;
}) {
  return Math.min(input.maxSeconds, input.baseSeconds * 2 ** Math.max(0, input.attempts - 1));
}

export function sanitizeJobError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "Unknown job error");
  return message.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").slice(0, 1000);
}
