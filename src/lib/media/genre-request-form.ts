import { parseGenreId, parseGenreName } from "./admin-genres";

export function parseGenreRequestDecision(formData: FormData): null | { requestId: number; decision: "map" | "create" | "exclude"; genreIds?: number[]; name?: string } {
  const requestId = parseGenreId(formData.get("requestId"));
  const decision = formData.get("decision");
  if (!requestId || (decision !== "map" && decision !== "create" && decision !== "exclude")) return null;
  if (decision === "create") {
    const name = parseGenreName(formData.get("name"));
    return name ? { requestId, decision, name } : null;
  }
  if (decision === "map") {
    const ids = formData.getAll("genreIds").map(parseGenreId);
    if (!ids.length || ids.some((id) => id === null)) return null;
    return { requestId, decision, genreIds: [...new Set(ids as number[])] };
  }
  return { requestId, decision };
}
