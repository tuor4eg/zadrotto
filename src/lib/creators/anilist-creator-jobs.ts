import { autoApproveAniListCreatorRequests } from "@/db/queries/creator-requests";
import { ANILIST_CREATOR_APPROVAL_JOB } from "@/db/queries/anilist-creators";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";

export const anilistCreatorApprovalHandler: JobHandlerDefinition<{ externalIds: string[] }> = {
  type: ANILIST_CREATOR_APPROVAL_JOB, label: "Автоматическое подтверждение создателей AniList", schedulable: false,
  defaultMaxAttempts: 3, defaultTimeoutSeconds: 300,
  parsePayload(value) {
    const row = value as { externalIds?: unknown } | null;
    if (!row || !Array.isArray(row.externalIds) || row.externalIds.length > 1000
      || row.externalIds.some(id => typeof id !== "string" || !/^(person|studio):[1-9][0-9]*$/.test(id))) throw new Error("Некорректные ID создателей AniList.");
    return { externalIds: [...new Set(row.externalIds as string[])] };
  },
  async execute({ payload, signal, runId, lockToken }) {
    if (!lockToken) throw new JobError("lease-lost", "Отсутствует lease задачи.", { retryable: false });
    await autoApproveAniListCreatorRequests({ externalIds: payload.externalIds, signal, jobGuard: { runId, lockToken } });
  },
};
