import "server-only";

import {
  createJobRun,
  getJobById,
  type JobRunPolicy,
} from "@/db/queries/jobs";
import {
  DEFAULT_JOB_MAX_ATTEMPTS,
  DEFAULT_JOB_RETRY_BASE_SECONDS,
  DEFAULT_JOB_RETRY_MAX_SECONDS,
  DEFAULT_JOB_TIMEOUT_SECONDS,
  type JobRunSource,
} from "./model";
import { jobHandlerRegistry } from "./handlers";

export function resolveJobRunPolicy(type: string, overrides?: Partial<JobRunPolicy>): JobRunPolicy {
  const definition = jobHandlerRegistry.get(type);
  return {
    maxAttempts: overrides?.maxAttempts ?? definition.defaultMaxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    retryBaseSeconds: overrides?.retryBaseSeconds ?? definition.defaultRetryBaseSeconds ?? DEFAULT_JOB_RETRY_BASE_SECONDS,
    retryMaxSeconds: overrides?.retryMaxSeconds ?? definition.defaultRetryMaxSeconds ?? DEFAULT_JOB_RETRY_MAX_SECONDS,
    timeoutSeconds: overrides?.timeoutSeconds ?? definition.defaultTimeoutSeconds ?? DEFAULT_JOB_TIMEOUT_SECONDS,
  };
}

export function validateJobRunPolicy(policy: JobRunPolicy) {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1 ||
      !Number.isInteger(policy.timeoutSeconds) || policy.timeoutSeconds < 1 ||
      !Number.isInteger(policy.retryBaseSeconds) || policy.retryBaseSeconds < 1 ||
      !Number.isInteger(policy.retryMaxSeconds) || policy.retryMaxSeconds < policy.retryBaseSeconds) {
    throw new Error("Invalid job retry or timeout policy.");
  }
  return policy;
}

export async function enqueueJobRun(input: {
  availableAt?: Date;
  createdByAdminId?: number | null;
  jobId?: number | null;
  payload: Record<string, unknown>;
  policy?: Partial<JobRunPolicy>;
  source: Exclude<JobRunSource, "schedule">;
  type: string;
}) {
  const definition = jobHandlerRegistry.get(input.type);
  const payload = definition.parsePayload(input.payload) as Record<string, unknown>;
  const { policy, ...runInput } = input;
  return createJobRun({
    ...runInput,
    payload,
    ...validateJobRunPolicy(resolveJobRunPolicy(input.type, policy)),
  });
}

export async function enqueueManualJobRun(jobId: number, createdByAdminId: number | null) {
  const job = await getJobById(jobId);
  if (!job) throw new Error("Job not found.");
  return enqueueJobRun({
    createdByAdminId,
    jobId: job.id,
    payload: job.payload,
    policy: {
      maxAttempts: job.maxAttempts,
      retryBaseSeconds: job.retryBaseSeconds,
      retryMaxSeconds: job.retryMaxSeconds,
      timeoutSeconds: job.timeoutSeconds,
    },
    source: "manual",
    type: job.type,
  });
}

export function getRegisteredJobHandlers() {
  return jobHandlerRegistry.list();
}
