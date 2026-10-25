import { deferJobRun, finishJobRun, requeueJobRun, isJobRunLeaseCurrent } from "@/db/queries/jobs";
import { sanitizeJobError } from "./model";
import { JobError, type AnyJobHandlerDefinition } from "./types";

export async function executeClaimedJobRun(input: {
  signal?: AbortSignal;
  getHandler: (type: string) => AnyJobHandlerDefinition;
  operations?: {
    finish: typeof finishJobRun;
    requeue: typeof requeueJobRun;
    defer?: typeof deferJobRun;
    isCurrent?: typeof isJobRunLeaseCurrent;
  };
  run: NonNullable<Awaited<ReturnType<typeof import("@/db/queries/jobs").claimNextJobRun>>>;
}) {
  const { run } = input;
  const operations = input.operations ?? { finish: finishJobRun, requeue: requeueJobRun, defer: deferJobRun };
  if (!run.lockToken) return;
  const controller = new AbortController();
  const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), run.timeoutSeconds * 1000);
  let ownershipTimer: ReturnType<typeof setInterval> | undefined;
  let checkingOwnership = false;
  const checkOwnership = async () => {
    if (checkingOwnership || controller.signal.aborted) return;
    checkingOwnership = true;
    try {
      if (!await (input.operations?.isCurrent ?? isJobRunLeaseCurrent)({id:run.id,lockToken:run.lockToken!})) {
        controller.abort(new JobError("lease-lost", "Запуск остановлен или больше не принадлежит этому worker.", {retryable:false}));
      }
    } catch {
      controller.abort(new JobError("lease-check-unavailable", "Не удалось проверить владение запуском."));
    } finally { checkingOwnership = false; }
  };
  try {
    await checkOwnership();
    signal.throwIfAborted();
    ownershipTimer = setInterval(() => { void checkOwnership(); }, 1000);
    const handler = input.getHandler(run.type);
    let payload: unknown;
    try {
      payload = handler.parsePayload(run.payload);
    } catch {
      throw new JobError("invalid-payload", "Параметры задачи не прошли проверку.", { retryable: false });
    }
    await handler.execute({ lockToken: run.lockToken, attempt: run.attempts, jobId: run.jobId, payload, runId: run.id, signal, source: run.source as import("./model").JobRunSource } as never);
    if (input.signal?.aborted) throw new JobError("interrupted", "Задача прервана при остановке worker.");
    if (controller.signal.reason instanceof JobError) throw controller.signal.reason;
    if (controller.signal.aborted) {
      throw new JobError("timeout", "Превышено время выполнения задачи.");
    }
    await operations.finish({ id: run.id, lockToken: run.lockToken, status: "succeeded" });
  } catch (error) {
    const normalized = controller.signal.reason instanceof JobError
      ? controller.signal.reason
      : error instanceof JobError
        ? error
      : input.signal?.aborted
        ? new JobError("interrupted", "Задача прервана при остановке worker.")
      : controller.signal.aborted
        ? new JobError("timeout", "Превышено время выполнения задачи.")
        : new JobError("execution-failed", "Не удалось выполнить задачу.");
    // Another owner or the administrator now controls this run. Do not finish,
    // retry or defer it on behalf of the stale worker.
    if (normalized.code === "lease-lost") return;
    if (!(error instanceof JobError) && !(controller.signal.reason instanceof JobError)) {
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
    if (ownershipTimer) clearInterval(ownershipTimer);
  }
}
