import { parseGenreId, parseGenreName } from "./admin-genres";

export function parseGenreRequestDecision(formData: FormData): null | { requestId: number; decision: "map" | "create" | "exclude"; genreIds?: number[]; name?: string; replacementFranchiseId?: number } {
  const requestId = parseGenreId(formData.get("requestId"));
  const decision = formData.get("decision");
  if (!requestId || (decision !== "map" && decision !== "create" && decision !== "exclude")) return null;
  if (decision === "create") {
    const name = parseGenreName(formData.get("name"));
    const rawSeriesId = formData.get("replacementFranchiseId");
    const replacementFranchiseId = rawSeriesId === null || rawSeriesId === "" ? null : parseGenreId(rawSeriesId);
    if (rawSeriesId !== null && rawSeriesId !== "" && replacementFranchiseId === null) return null;
    return name ? { requestId, decision, name, ...(replacementFranchiseId === null ? {} : { replacementFranchiseId }) } : null;
  }
  if (decision === "map") {
    const ids = formData.getAll("genreIds").map(parseGenreId);
    if (!ids.length || ids.some((id) => id === null)) return null;
    return { requestId, decision, genreIds: [...new Set(ids as number[])] };
  }
  return { requestId, decision };
}
