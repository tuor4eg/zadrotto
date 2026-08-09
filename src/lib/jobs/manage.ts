import "server-only";

import { createPeriodicJob, updatePeriodicJob, type JobRunPolicy } from "@/db/queries/jobs";
import { getNextJobRunAt, validateJobCronExpression } from "./cron";
import { jobHandlerRegistry } from "./handlers";
import { resolveJobRunPolicy, validateJobRunPolicy } from "./queue";

type PeriodicJobInput = {
  code: string;
  cronExpression: string;
  payload: unknown;
  policy?: Partial<JobRunPolicy>;
  type: string;
  enabled?: boolean;
};

function normalize(input: PeriodicJobInput) {
  const code = input.code.trim();
  if (!code) throw new Error("Код задачи обязателен.");
  const handler = jobHandlerRegistry.get(input.type);
  const cronExpression = validateJobCronExpression(input.cronExpression);
  return { code, cronExpression, enabled: input.enabled ?? false, nextRunAt: getNextJobRunAt(cronExpression, new Date()), payload: handler.parsePayload(input.payload) as Record<string, unknown>, policy: validateJobRunPolicy(resolveJobRunPolicy(input.type, input.policy)), type: handler.type };
}

export async function createManagedPeriodicJob(input: PeriodicJobInput) {
  const value = normalize(input);
  return createPeriodicJob(value);
}

export async function updateManagedPeriodicJob(id: number, input: PeriodicJobInput) {
  const value = normalize(input);
  return updatePeriodicJob({ ...value, id });
}
