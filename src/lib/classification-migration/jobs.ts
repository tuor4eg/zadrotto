import "server-only";
import { executeClassificationMigration } from "@/db/queries/classification-migration";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";

export function parseClassificationJobPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new JobError("invalid-payload", "Ожидался утверждённый перенос.", { retryable: false });
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 2 || typeof row.migrationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.migrationId) || typeof row.previewHash !== "string" || !/^[0-9a-f]{64}$/.test(row.previewHash)) throw new JobError("invalid-payload", "Некорректный перенос или хеш предпросмотра.", { retryable: false });
  return { migrationId: row.migrationId, previewHash: row.previewHash };
}
type Payload = ReturnType<typeof parseClassificationJobPayload>;
function handler(direction: "apply" | "rollback"): JobHandlerDefinition<Payload> {
  return {
    type: `classification.${direction}`,
    label: direction === "apply" ? "Перенос тематических серий в теги" : "Откат переноса тематических серий",
    schedulable: false,
    defaultMaxAttempts: 1,
    defaultTimeoutSeconds: 3600,
    parsePayload: parseClassificationJobPayload,
    async execute({ payload, runId, lockToken, signal }) {
      if (!lockToken) throw new JobError("lease-lost", "Нет действующей блокировки запуска.", { retryable: false });
      await executeClassificationMigration(payload, direction, { runId, lockToken }, signal);
    },
  };
}
export const classificationApplyHandler = handler("apply");
export const classificationRollbackHandler = handler("rollback");
