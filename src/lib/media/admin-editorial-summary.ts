import { parseCatalogSort, type CatalogSort } from "@/app/media-items-catalog-logic";
import { getEditorialSummarySourceHash, type EditorialSummarySource } from "./editorial-summary";

export type AdminMediaSort = CatalogSort | "editorial_attempted_at";

export function parseAdminMediaSort(value: string | null): AdminMediaSort {
  return value === "editorial_attempted_at" ? value : parseCatalogSort(value);
}

export type AdminEditorialSummaryState = "missing" | "ready" | "stale" | "unusable" | "locked";

export function getAdminEditorialSummaryState(input: {
  source: EditorialSummarySource;
  status: string | null;
  sourceHash: string | null;
  locked: boolean | null;
  prompt: string | null;
}): AdminEditorialSummaryState {
  if (input.status !== "ready" && input.status !== "unusable") return "missing";
  if (input.locked) return "locked";
  if (input.prompt && input.sourceHash !== getEditorialSummarySourceHash(input.source, input.prompt)) return "stale";
  return input.status;
}
