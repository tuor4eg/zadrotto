import { failReputationInitialization } from "@/db/queries/reputation";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";
import { initializeReputation } from "./initialize";

export const reputationInitializeHandler: JobHandlerDefinition<Record<string, unknown>> = {
  type: "reputation.initialize",
  label: "Первичный расчёт уровней и доверия",
  defaultMaxAttempts: 1,
  defaultTimeoutSeconds: 900,
  schedulable: false,
  parsePayload(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some(key => key !== "initializationRequested")
      || !("initializationRequested" in value) || value.initializationRequested !== true) {
      throw new JobError("invalid-payload", "Некорректные параметры расчёта репутации.", { retryable: false });
    }
    return value as Record<string, unknown>;
  },
  async execute({ runId, lockToken }) {
    if (!lockToken) throw new JobError("lease-lost", "Не подтверждено владение задачей.", { retryable: false });
    const guard = { runId, lockToken };
    try {
      await initializeReputation(guard);
    } catch (error) {
      // Invalid historical runs never owned the settings state. A lost lease
      // must not permit a former worker to clean up a newer initialization.
      if (!(error instanceof JobError && ["invalid-initialization", "lease-lost"].includes(error.code))) {
        await failReputationInitialization(guard);
      }
      throw error;
    }
  },
};
