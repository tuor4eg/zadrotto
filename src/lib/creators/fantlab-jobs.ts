import { withSnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { createJobRun } from "@/db/queries/jobs";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";
import { creatorAdminLabel } from "./admin-label";
import { parseFantlabSyncPayload, runFantlabCreatorBatch, type FantlabSyncPayload } from "./fantlab-sync";

function handler(kind: "bindings" | "avatars"): JobHandlerDefinition<FantlabSyncPayload> {
  const type = kind === "bindings" ? "media.creator-fantlab-bindings" : "media.creator-fantlab-avatars";
  return {
    type,
    label: kind === "bindings" ? "Подтвердить FantLab ID существующих создателей" : "Загрузить аватарки создателей из FantLab",
    schedulable: false,
    defaultMaxAttempts: 1,
    defaultTimeoutSeconds: 900,
    parsePayload(value) {
      try { return parseFantlabSyncPayload(value); }
      catch (error) { throw new JobError("invalid-payload", error instanceof Error ? error.message : "Некорректные параметры.", { retryable: false }); }
    },
    async execute({ source, signal, payload, runId, jobId, lockToken }) {
      if (source !== "manual" || jobId !== null) throw new JobError("manual-only", "Доступен только разовый запуск из админки.", { retryable: false });
      const jobGuard = lockToken ? { runId, lockToken } : undefined;
      const report = await runFantlabCreatorBatch(kind, payload, signal, async row => {
        await logSystemActivity({ jobGuard, action: "creator.fantlab-sync.progress", entityType: "job-run", entityId: runId,
          message: `${creatorAdminLabel(row.creatorId, row.creatorName)}: ${row.status}${row.message ? ` — ${row.message}` : ""}`,
          metadata: { kind, dryRun: payload.dryRun, ...row } });
      }, jobGuard);
      await logSystemActivity({ jobGuard, action: "creator.fantlab-sync.completed", entityType: "job-run", entityId: runId,
        message: `FantLab ${kind === "bindings" ? "привязки" : "аватарки"}: обработано ${report.processed}; следующий курсор ${report.afterId}${report.hasMore ? "; будет продолжение" : "; обход завершён"}.`,
        metadata: { kind, dryRun: payload.dryRun, ...report } });
      signal.throwIfAborted();
      if (report.hasMore) await withSnapshotJobGuard(jobGuard, tx => createJobRun({ type, source: "manual", payload: { ...payload, afterId: report.afterId },
        maxAttempts: 1, timeoutSeconds: 900, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx));
    },
  };
}
export const creatorFantlabBindingHandler = handler("bindings");
export const creatorFantlabAvatarHandler = handler("avatars");
