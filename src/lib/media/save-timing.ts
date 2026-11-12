import { randomUUID } from "node:crypto";

export type MediaSaveTiming = { stage: (name: string) => void };

/** Request-local diagnostics. Never include form values, titles, tokens, or files. */
export async function traceMediaSave<T>(
  operation: string,
  run: (timing: MediaSaveTiming) => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  const requestId = randomUUID();
  const progress = (event: string, stage?: string) => console.info("[media-save-timing]", JSON.stringify({
    requestId, operation, event, stage, elapsedMs: Math.round(performance.now() - startedAt),
  }));
  progress("start");
  const stages: Array<{ name: string; durationMs: number }> = [];
  let stageName = "start";
  let stageStartedAt = startedAt;
  const finishStage = () => {
    const now = performance.now();
    stages.push({ name: stageName, durationMs: Math.round(now - stageStartedAt) });
    stageStartedAt = now;
  };
  try {
    return await run({ stage(name) { finishStage(); stageName = name; progress("stage", name); } });
  } finally {
    finishStage();
    // finally also records redirects and failed saves without altering their behavior.
    console.info("[media-save-timing]", JSON.stringify({
      requestId,
      event: "finished",
      operation,
      durationMs: Math.round(performance.now() - startedAt),
      stages,
    }));
  }
}
