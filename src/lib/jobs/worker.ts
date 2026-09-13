import { deferJobRun, finishJobRun, requeueJobRun } from "@/db/queries/jobs";
import { sanitizeJobError } from "./model";
import { JobError, type AnyJobHandlerDefinition } from "./types";

export async function executeClaimedJobRun(input: {
  getHandler: (type: string) => AnyJobHandlerDefinition;
  operations?: {
    finish: typeof finishJobRun;
    requeue: typeof requeueJobRun;
    defer?: typeof deferJobRun;
  };
  run: NonNullable<Awaited<ReturnType<typeof import("@/db/queries/jobs").claimNextJobRun>>>;
}) {
  const { run } = input;
  const operations = input.operations ?? { finish: finishJobRun, requeue: requeueJobRun, defer: deferJobRun };
  if (!run.lockToken) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), run.timeoutSeconds * 1000);
  try {
    const handler = input.getHandler(run.type);
    let payload: unknown;
    try {
      payload = handler.parsePayload(run.payload);
    } catch {
      throw new JobError("invalid-payload", "Параметры задачи не прошли проверку.", { retryable: false });
    }
    await handler.execute({ attempt: run.attempts, jobId: run.jobId, payload, runId: run.id, signal: controller.signal, source: run.source as import("./model").JobRunSource } as never);
    if (controller.signal.aborted) {
      throw new JobError("timeout", "Превышено время выполнения задачи.");
    }
    await operations.finish({ id: run.id, lockToken: run.lockToken, status: "succeeded" });
  } catch (error) {
    const normalized = error instanceof JobError
      ? error
      : controller.signal.aborted
        ? new JobError("timeout", "Превышено время выполнения задачи.")
        : new JobError("execution-failed", "Не удалось выполнить задачу.");
    if (!(error instanceof JobError)) {
      const errorName = error instanceof Error ? error.name : typeof error;
      console.error(`jobs worker: run ${run.id} failed with unexpected ${errorName}`);
    }
    if (normalized.deferSeconds !== null) {
      await (operations.defer ?? deferJobRun)({
        id: run.id,
        lockToken: run.lockToken,
        delaySeconds: normalized.deferSeconds,
        errorCode: normalized.code,
        errorMessage: sanitizeJobError(normalized),
      });
    } else if (normalized.retryable && run.attempts < run.maxAttempts) {
      await operations.requeue({ errorCode: normalized.code, errorMessage: sanitizeJobError(normalized), id: run.id, lockToken: run.lockToken });
    } else {
      await operations.finish({ errorCode: normalized.code, errorMessage: sanitizeJobError(normalized), id: run.id, lockToken: run.lockToken, status: "failed" });
    }
  } finally {
    clearTimeout(timer);
  }
}
