export type PlatformProviderVariant = {
  mappingId?: number;
  applying?: boolean;
  platformId: number;
  provider: string;
  mediaType: string;
  mediaTypeName: string;
  externalPlatformName: string;
};

export type PlatformProviderVariantGroup = {
  provider: string;
  mediaType: string;
  mediaTypeName: string;
  names: string[];
  variants?: { mappingId: number; name: string; applying: boolean }[];
};

export function groupPlatformProviderVariants(variants: readonly PlatformProviderVariant[]) {
  const groups = new Map<string, PlatformProviderVariantGroup>();
  for (const variant of variants) {
    const key = JSON.stringify([variant.provider, variant.mediaType]);
    const group = groups.get(key) ?? {
      provider: variant.provider, mediaType: variant.mediaType,
      mediaTypeName: variant.mediaTypeName, names: [], variants: [],
    };
    if (!group.names.includes(variant.externalPlatformName)) group.names.push(variant.externalPlatformName);
    if (variant.mappingId !== undefined && !group.variants?.some((item) => item.name === variant.externalPlatformName)) {
      group.variants!.push({ mappingId: variant.mappingId, name: variant.externalPlatformName, applying: variant.applying ?? false });
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group, variants: group.variants?.sort((a, b) => a.name.localeCompare(b.name, "ru")), names: [...group.names].sort((a, b) => a.localeCompare(b, "ru")),
  })).sort((a, b) => a.provider.localeCompare(b.provider) || a.mediaType.localeCompare(b.mediaType));
}

export function parsePlatformId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

export function parsePlatformName(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}
