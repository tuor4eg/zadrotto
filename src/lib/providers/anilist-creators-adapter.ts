import type { SnapshotDescriptor } from "./types";

export type AniListCreatorReference = {
  externalId: string; name: string; roleCode: "director" | "production_company" | "producer"; sourcePosition: number;
};
export type AniListCreatorPayload = {
  mediaId: number; idMal: number | null; complete: true;
  staff: { id: number; name: string; role: string; image?: { large?: string | null; medium?: string | null } | null; siteUrl?: string | null }[];
  studios: { id: number; name: string; isAnimationStudio: boolean }[];
};
export function describeAniListCreators(externalId: string): SnapshotDescriptor {
  if (!/^[1-9][0-9]*$/.test(externalId) || !Number.isSafeInteger(Number(externalId))) throw new Error("INVALID_ANILIST_ID");
  return { providerCode: "anilist", resourceType: "anime", externalId, apiMethod: "anime.creators", requestParams: { version: 1 } };
}
export function parseAniListCreatorPayload(value: unknown): AniListCreatorPayload {
  if (!value || typeof value !== "object") throw new Error("INVALID_ANILIST_ROSTER");
  const p = value as AniListCreatorPayload;
  const validId = (id: unknown) => Number.isSafeInteger(id) && Number(id) > 0;
  const validName = (name: unknown) => typeof name === "string" && name.trim().length > 0;
  if (p.complete !== true || !validId(p.mediaId) || (p.idMal !== null && !validId(p.idMal))
    || !Array.isArray(p.staff) || !Array.isArray(p.studios)
    || p.staff.some(r => !r || !validId(r.id) || !validName(r.name) || !validName(r.role))
    || p.studios.some(r => !r || !validId(r.id) || !validName(r.name) || typeof r.isAnimationStudio !== "boolean")) throw new Error("INVALID_ANILIST_ROSTER");
  // Conflicting observations cannot be used as evidence for automatic identity resolution.
  for (const rows of [p.staff, p.studios]) {
    const seen = new Map<number, string>();
    for (const row of rows) {
      const identity = JSON.stringify({ name: row.name.trim(), ...("isAnimationStudio" in row ? { studio: row.isAnimationStudio } : {}) });
      if (seen.has(row.id) && seen.get(row.id) !== identity) throw new Error("CONFLICTING_ANILIST_IDENTITY");
      seen.set(row.id, identity);
    }
  }
  return p;
}
export function extractAniListCreatorReferences(value: unknown): AniListCreatorReference[] {
  const p = parseAniListCreatorPayload(value);
  const rows: AniListCreatorReference[] = [
    ...p.staff.flatMap((row, sourcePosition) => row.role === "Director" ? [{ externalId: `person:${row.id}`, name: row.name.trim(), roleCode: "director" as const, sourcePosition }] : []),
    ...p.studios.map((row, sourcePosition) => ({ externalId: `studio:${row.id}`, name: row.name.trim(), roleCode: row.isAnimationStudio ? "production_company" as const : "producer" as const, sourcePosition })),
  ];
  const unique = new Map<string, AniListCreatorReference>();
  for (const row of rows) if (!unique.has(`${row.externalId}:${row.roleCode}`)) unique.set(`${row.externalId}:${row.roleCode}`, row);
  return [...unique.values()];
}
