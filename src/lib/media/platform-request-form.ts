import { parsePlatformId, parsePlatformName } from "./admin-platforms";

export function parsePlatformRequestDecision(formData: FormData): null | { requestId: number; decision: "map" | "create" | "exclude"; platformIds?: number[]; name?: string } {
  const requestId = parsePlatformId(formData.get("requestId"));
  const decision = formData.get("decision");
  if (!requestId || (decision !== "map" && decision !== "create" && decision !== "exclude")) return null;
  if (decision === "create") {
    const name = parsePlatformName(formData.get("name"));
    return name ? { requestId, decision, name } : null;
  }
  if (decision === "map") {
    const ids = formData.getAll("platformIds").map(parsePlatformId);
    if (!ids.length || ids.some((id) => id === null)) return null;
    return { requestId, decision, platformIds: [...new Set(ids as number[])] };
  }
  return { requestId, decision };
}
