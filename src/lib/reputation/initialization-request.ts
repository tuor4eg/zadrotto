/** Only the atomic reputation settings action issues this marker. */
export function isReputationInitializationRequest(run: {
  type: string;
  source: string;
  createdByAdminId: number | null;
  payload: Record<string, unknown>;
}) {
  return run.type === "reputation.initialize" && run.source === "manual"
    && run.createdByAdminId !== null && run.payload.initializationRequested === true;
}
