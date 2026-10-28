import { CREATOR_AUTO_APPROVAL_JOB, enqueueCreatorAutoApprovalRun, getCreatorAutoApprovalBatch, getCreatorAutoApprovalUpperId, type CreatorAutoApprovalPayload } from "@/db/queries/creator-auto-approval-jobs";
import { CreatorRequestError, resolveCreatorRequest } from "@/db/queries/creator-requests";
import { withSnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

export const creatorAutoApprovalHandler: JobHandlerDefinition<CreatorAutoApprovalPayload> = {
  type: CREATOR_AUTO_APPROVAL_JOB,
  label: "Автоодобрение заявок на создателей",
  schedulable: true,
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 300,
  parsePayload(value) {
    if (value && typeof value === "object" && !Array.isArray(value)
      && (Object.keys(value).length === 0 || (Object.keys(value).length === 1 && "scanPending" in value && value.scanPending === true))) {
      return { scanPending: true };
    }
    const row = value as Partial<{ requestIds: unknown; afterId: unknown; upToId: unknown; scanPending: unknown }> | null;
    if (row && Array.isArray(row.requestIds) && row.requestIds.length > 0 && row.requestIds.length <= 100
      && row.requestIds.every(validId) && row.afterId === undefined && row.upToId === undefined && row.scanPending === undefined) {
      return { requestIds: [...new Set(row.requestIds)] };
    }
    if (row && row.scanPending === undefined && row.requestIds === undefined && typeof row.afterId === "number" && Number.isSafeInteger(row.afterId)
      && row.afterId >= 0 && validId(row.upToId) && row.afterId <= row.upToId) {
      return { afterId: row.afterId, upToId: row.upToId };
    }
    throw new JobError("invalid-payload", "Некорректная партия заявок на создателей.", { retryable: false });
  },
  async execute({ payload, signal, runId, lockToken }) {
    if (!lockToken) throw new JobError("lease-lost", "Отсутствует lease задачи.", { retryable: false });
    const guard = { runId, lockToken };
    if ("scanPending" in payload) {
      await withSnapshotJobGuard(guard, async tx => {
        const upToId = await getCreatorAutoApprovalUpperId(tx);
        if (upToId !== null) await enqueueCreatorAutoApprovalRun(tx, { afterId: 0, upToId });
      });
      return;
    }
    const ids = "requestIds" in payload ? payload.requestIds
      : (await getCreatorAutoApprovalBatch(payload.afterId, payload.upToId)).map(row => row.id);
    for (const requestId of ids) {
      signal.throwIfAborted();
      try {
        await resolveCreatorRequest({ requestId, decision: "create", autoApprove: true, jobGuard: guard });
      } catch (error) {
        if (!(error instanceof CreatorRequestError && ["auto-skip", "already-resolved", "applying", "not-found", "logo-only"].includes(error.code))) throw error;
      }
    }
    signal.throwIfAborted();
    if (!("requestIds" in payload) && ids.length === 100 && ids[ids.length - 1] < payload.upToId) {
      await withSnapshotJobGuard(guard, tx => enqueueCreatorAutoApprovalRun(tx, { afterId: ids[ids.length - 1], upToId: payload.upToId }));
    }
  },
};
