import "dotenv/config";

import { getDbClient } from "@/db";
import { JOB_SCHEDULER_BATCH_SIZE, JOB_SCHEDULER_POLL_MS } from "./runtime";
import { runSchedulerTick } from "@/lib/jobs/scheduler";

let stopping = false;
const shutdownController = new AbortController();
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

async function main() {
  while (!stopping) {
    try {
      const runs = await runSchedulerTick({ limit: JOB_SCHEDULER_BATCH_SIZE });
      if (runs.length) console.log(`jobs scheduler: queued ${runs.length} run(s)`);
    } catch (error) {
      console.error("jobs scheduler: tick failed", error);
    }
    await wait(JOB_SCHEDULER_POLL_MS);
  }
}

void main().then(
  () => getDbClient().end({ timeout: 5 }).catch(() => undefined),
  async (error) => {
    console.error("jobs scheduler: fatal error", error);
    process.exitCode = 1;
    await getDbClient().end({ timeout: 5 }).catch(() => undefined);
  },
);
