import "dotenv/config";

import { getDbClient } from "@/db";
import { claimNextJobRun, recoverExpiredJobRuns } from "@/db/queries/jobs";
import { jobHandlerRegistry } from "@/lib/jobs/handlers";
import { executeClaimedJobRun } from "@/lib/jobs/worker";
import { JOB_RECOVERY_POLL_MS, JOB_WORKER_POLL_MS } from "./runtime";

let stopping = false;
const shutdownController = new AbortController();
const lockedBy = `${process.env.HOSTNAME ?? "jobs-worker"}:${process.pid}`;
function stop() {
  stopping = true;
  shutdownController.abort();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

function wait(ms: number) {
  if (stopping) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      shutdownController.signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    shutdownController.signal.addEventListener("abort", finish, { once: true });
  });
}

async function runClaimLoop() {
  while (!stopping) {
    try {
      const run = await claimNextJobRun({ lockedBy });
      if (run) await executeClaimedJobRun({ getHandler: (type) => jobHandlerRegistry.get(type), run });
    } catch (error) {
      console.error("jobs worker: iteration failed", error);
    }
    await wait(JOB_WORKER_POLL_MS);
  }
}

async function runRecoveryLoop() {
  while (!stopping) {
    try {
      await recoverExpiredJobRuns();
    } catch (error) {
      console.error("jobs worker: recovery tick failed", error);
    }
    await wait(JOB_RECOVERY_POLL_MS);
  }
}

async function main() {
  try {
    await Promise.all([runClaimLoop(), runRecoveryLoop()]);
  } finally {
    await getDbClient().end({ timeout: 5 }).catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error("jobs worker: fatal error", error);
  process.exitCode = 1;
});
