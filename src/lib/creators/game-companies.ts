export type GameCompanyProvider = "igdb" | "rawg";
export type GameCompanyReference = {
  externalId: string;
  name: string;
  roleCode: "developer" | "publisher";
  sourceUrl?: string;
};
export type GameCompanyProfile = {
  provider: GameCompanyProvider;
  externalId: string;
  name: string;
  sourceUrl: string | null;
  details: Record<string, unknown>;
  imageUrl: string | null;
};
export function isGameCompanyProvider(value: unknown): value is GameCompanyProvider {
  return value === "igdb" || value === "rawg";
}
export function isGameCompanyId(provider: string, value: string) {
  return (provider === "igdb" ? /^company:[1-9]\d*$/ : provider === "rawg" ? /^(developer|publisher):[1-9]\d*$/ : /$^/).test(value)
    && Number.isSafeInteger(Number(value.split(":")[1]));
}
/** null means legacy/unrestored, [] is a complete empty roster. Validate before mutating provenance. */
export function extractGameCompanyReferences(facts: Record<string, unknown>, provider: GameCompanyProvider): GameCompanyReference[] | null {
  if (!Object.hasOwn(facts, "gameCompanyReferences")) return null;
  if (!Array.isArray(facts.gameCompanyReferences)) throw new Error("Некорректный состав организаций игры.");
  const unique = new Map<string, GameCompanyReference>();
  for (const value of facts.gameCompanyReferences) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Некорректная организация игры.");
    const row = value as Record<string, unknown>;
    if (typeof row.externalId !== "string" || !isGameCompanyId(provider, row.externalId)
      || typeof row.name !== "string" || !row.name.trim() || (row.roleCode !== "developer" && row.roleCode !== "publisher")
      || (provider === "rawg" && !row.externalId.startsWith(`${row.roleCode}:`))
      || (row.sourceUrl !== undefined && (typeof row.sourceUrl !== "string" || !/^https:\/\//.test(row.sourceUrl)))) throw new Error("Некорректная идентичность организации игры.");
    unique.set(`${row.externalId}:${row.roleCode}`, { externalId: row.externalId, name: row.name.trim(), roleCode: row.roleCode, ...(row.sourceUrl ? { sourceUrl: row.sourceUrl as string } : {}) });
  }
  return [...unique.values()].sort((a, b) => a.externalId.localeCompare(b.externalId) || a.roleCode.localeCompare(b.roleCode));
}
