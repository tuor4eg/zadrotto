function readPositiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export const JOB_SCHEDULER_BATCH_SIZE = readPositiveInteger("JOB_SCHEDULER_BATCH_SIZE", 50);
export const JOB_SCHEDULER_POLL_MS = readPositiveInteger("JOB_SCHEDULER_POLL_MS", 15_000);
export const JOB_WORKER_POLL_MS = readPositiveInteger("JOB_WORKER_POLL_MS", 1_000);
export const JOB_RECOVERY_POLL_MS = readPositiveInteger("JOB_RECOVERY_POLL_MS", 30_000);
