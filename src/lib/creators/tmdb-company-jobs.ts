import { autoApproveTmdbCompanyRequests } from "@/db/queries/creator-requests";
import { TMDB_COMPANY_APPROVAL_JOB } from "@/db/queries/tmdb-companies";
import { isTmdbOrganizationId } from "./tmdb-companies";
import { type JobHandlerDefinition } from "@/lib/jobs/types";

export const tmdbCompanyApprovalHandler: JobHandlerDefinition<{ externalIds: string[] }> = {
  type: TMDB_COMPANY_APPROVAL_JOB, label: "Автоапрув организаций TMDB", schedulable: false,
  defaultMaxAttempts: 3, defaultTimeoutSeconds: 300,
  parsePayload(value) {
    const row = value as { externalIds?: unknown } | null;
    if (!row || !Array.isArray(row.externalIds) || row.externalIds.length > 1000 || row.externalIds.some(id => !isTmdbOrganizationId(id))) throw new Error("Некорректные ID организаций.");
    return { externalIds: [...new Set(row.externalIds as string[])] };
  },
  async execute({ payload, signal, runId, lockToken }) {
    await autoApproveTmdbCompanyRequests({ externalIds: payload.externalIds, signal, jobGuard: lockToken ? { runId, lockToken } : undefined });
  },
};
