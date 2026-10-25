import { autoApproveTmdbDirectorRequests } from "@/db/queries/creator-requests";
import { TMDB_DIRECTOR_APPROVAL_JOB } from "@/db/queries/tmdb-directors";
import { isTmdbPersonId } from "./tmdb-directors";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";

export const tmdbDirectorApprovalHandler: JobHandlerDefinition<{ externalIds: string[] }> = {
  type: TMDB_DIRECTOR_APPROVAL_JOB, label: "Автоапрув персон TMDB", schedulable: false,
  defaultMaxAttempts: 3, defaultTimeoutSeconds: 300,
  parsePayload(value) {
    const row = value as { externalIds?: unknown } | null;
    if (!row || !Array.isArray(row.externalIds) || row.externalIds.length > 1000 || row.externalIds.some(id => !isTmdbPersonId(id))) throw new Error("Некорректные ID персон.");
    return { externalIds: [...new Set(row.externalIds as string[])] };
  },
  async execute({ payload, signal, runId, lockToken }) {
    if (!lockToken) throw new JobError("lease-lost", "Отсутствует lease задачи.", { retryable: false });
    await autoApproveTmdbDirectorRequests({ externalIds: payload.externalIds, signal, jobGuard: { runId, lockToken } });
  },
};
