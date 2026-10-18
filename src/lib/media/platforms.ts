import { normalizeSearchText } from "@/lib/search/normalize";

export type MediaItemPlatform = { id: number; slug: string; name: string };
export type ExternalPlatform = { name: string; normalizedName: string };
export type PlatformMapping = {
  normalizedExternalPlatformName: string;
  platform: MediaItemPlatform;
  isActive: boolean;
};

/** Keep provider strings whole, including the pipe in Xbox Series X|S. */
export function extractExternalPlatforms(facts: Record<string, unknown>): ExternalPlatform[] {
  const value = facts.platforms;
  const values = value == null ? [] : typeof value === "string" ? [value] : value;
  if (!Array.isArray(values) || values.some((name) => typeof name !== "string")) {
    throw new Error("Invalid provider platforms: expected strings or a string array");
  }
  const unique = new Map<string, ExternalPlatform>();
  for (const name of values as string[]) {
    const normalizedName = normalizeSearchText(name);
    if (normalizedName && !unique.has(normalizedName)) unique.set(normalizedName, { name: name.trim(), normalizedName });
  }
  return [...unique.values()];
}

export function resolvePlatformMappings(input: {
  externalPlatforms: readonly ExternalPlatform[];
  mappings: readonly PlatformMapping[];
  provider: string | null;
  mediaType: string;
  excludedNames?: readonly string[];
}) {
  const platformsById = new Map<number, MediaItemPlatform>();
  const unmapped: ExternalPlatform[] = [];
  if (input.mediaType !== "game") return { platforms: [], unmapped };
  for (const external of input.externalPlatforms) {
    if (input.excludedNames?.includes(external.normalizedName)) continue;
    const matches = input.mappings.filter((mapping) => mapping.normalizedExternalPlatformName === external.normalizedName);
    if (!matches.length) unmapped.push(external);
    for (const mapping of matches) if (mapping.isActive) platformsById.set(mapping.platform.id, mapping.platform);
  }
  const platforms = [...platformsById.values()].sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : a.id - b.id);
  return { platforms, unmapped };
}
