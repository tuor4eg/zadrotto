import { claimDueScheduledJobs } from "@/db/queries/jobs";
import { getNextJobRunAt } from "./cron";

export function runSchedulerTick(input?: { limit?: number; now?: Date }) {
  return claimDueScheduledJobs({ getNextRunAt: getNextJobRunAt, limit: input?.limit ?? 50, now: input?.now });
}
