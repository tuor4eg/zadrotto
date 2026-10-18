import { normalizeSearchText } from "@/lib/search/normalize";

export type ExternalCreator = { name: string; normalizedName: string };
export type EntryCreator = { id: number; name: string; slug: string; typeCode: string; roleId: number; roleCode: string; roleName: string; isManual: boolean; hasProviderSource: boolean };

/** null means legacy metadata: preserve provenance until a refresh supplies author IDs. */
export function extractFantlabCreatorReferences(facts: Record<string, unknown>) {
  if (facts.fantlabAuthors === undefined) return null;
  if (!Array.isArray(facts.fantlabAuthors)) throw new Error("Invalid FantLab author references");
  const result = new Map<string, { id: string; name: string; normalizedName: string }>();
  for (const value of facts.fantlabAuthors) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid FantLab author reference");
    const reference = value as Record<string, unknown>;
    if (typeof reference.id !== "string" || !/^[1-9]\d*$/.test(reference.id) || !Number.isSafeInteger(Number(reference.id)) || typeof reference.name !== "string" || !normalizeSearchText(reference.name)) throw new Error("Invalid FantLab author reference");
    if (!result.has(reference.id)) result.set(reference.id, { id: reference.id, name: reference.name.trim(), normalizedName: normalizeSearchText(reference.name) });
  }
  return [...result.values()];
}

/** Names remain whole, including commas; provider metadata supplies individual authors. */
export function extractExternalCreators(facts: Record<string, unknown>): ExternalCreator[] {
  const value = facts.authors;
  const values = value == null ? [] : typeof value === "string" ? [value] : value;
  if (!Array.isArray(values) || values.some((name) => typeof name !== "string")) {
    throw new Error("Invalid provider authors: expected strings or a string array");
  }
  const result = new Map<string, ExternalCreator>();
  for (const name of values as string[]) {
    const normalizedName = normalizeSearchText(name);
    if (normalizedName && !result.has(normalizedName)) result.set(normalizedName, { name: name.trim(), normalizedName });
  }
  return [...result.values()];
}

export type BggCreatorReference = { externalId: string; name: string; normalizedName: string; roleCode: "designer" | "artist" };

/** Missing references are legacy; an explicit empty array is a complete empty roster. */
export function extractBggCreatorReferences(facts: Record<string, unknown>): BggCreatorReference[] | null {
  if (facts.bggCreators === undefined) return null;
  if (!Array.isArray(facts.bggCreators)) throw new Error("Некорректные участники BGG.");
  const result = new Map<string, BggCreatorReference>();
  for (const value of facts.bggCreators) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Некорректный участник BGG.");
    const row = value as Record<string, unknown>;
    if (typeof row.externalId !== "string" || !/^[1-9]\d*$/.test(row.externalId) || !Number.isSafeInteger(Number(row.externalId))
      || typeof row.name !== "string" || !normalizeSearchText(row.name) || (row.roleCode !== "designer" && row.roleCode !== "artist")) throw new Error("Некорректный участник BGG.");
    const key = `${row.externalId}:${row.roleCode}`;
    result.set(key, { externalId: row.externalId, name: row.name.trim(), normalizedName: normalizeSearchText(row.name), roleCode: row.roleCode });
  }
  return [...result.values()];
}
