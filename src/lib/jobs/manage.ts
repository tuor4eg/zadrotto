import "server-only";

import { createPeriodicJob, updatePeriodicJob, type JobRunPolicy } from "@/db/queries/jobs";
import { getNextJobRunAt, validateJobCronExpression } from "./cron";
import { jobHandlerRegistry } from "./handlers";
import {
  DEFAULT_JOB_HISTORY_RETENTION_DAYS,
  MAX_JOB_HISTORY_RETENTION_DAYS,
  MIN_JOB_HISTORY_RETENTION_DAYS,
} from "./model";
import { resolveJobRunPolicy, validateJobRunPolicy } from "./queue";

type PeriodicJobInput = {
  code: string;
  cronExpression: string;
  payload: unknown;
  policy?: Partial<JobRunPolicy>;
  type: string;
  enabled?: boolean;
  historyRetentionDays?: number;
};

function normalize(input: PeriodicJobInput) {
  const code = input.code.trim();
  if (!code) throw new Error("Код задачи обязателен.");
  const handler = jobHandlerRegistry.get(input.type);
  if (handler.schedulable === false) throw new Error("Этот обработчик нельзя ставить на расписание.");
  const cronExpression = validateJobCronExpression(input.cronExpression);
  const historyRetentionDays = input.historyRetentionDays ?? DEFAULT_JOB_HISTORY_RETENTION_DAYS;
  if (!Number.isInteger(historyRetentionDays) || historyRetentionDays < MIN_JOB_HISTORY_RETENTION_DAYS || historyRetentionDays > MAX_JOB_HISTORY_RETENTION_DAYS) {
    throw new Error("Invalid job history retention period.");
  }
  return { code, cronExpression, enabled: input.enabled ?? false, historyRetentionDays, nextRunAt: getNextJobRunAt(cronExpression, new Date()), payload: handler.parsePayload(input.payload) as Record<string, unknown>, policy: validateJobRunPolicy(resolveJobRunPolicy(input.type, input.policy)), type: handler.type };
}

export async function createManagedPeriodicJob(input: PeriodicJobInput) {
  const value = normalize(input);
  return createPeriodicJob(value);
}

export async function updateManagedPeriodicJob(id: number, input: PeriodicJobInput) {
  const value = normalize(input);
  return updatePeriodicJob({ ...value, id });
}
