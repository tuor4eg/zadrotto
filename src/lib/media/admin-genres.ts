export type GenreProviderVariant = {
  mappingId?: number;
  applying?: boolean;
  genreId: number;
  provider: string;
  mediaType: string;
  mediaTypeName: string;
  externalGenreName: string;
};

export type GenreProviderVariantGroup = {
  provider: string;
  mediaType: string;
  mediaTypeName: string;
  names: string[];
  variants?: { mappingId: number; name: string; applying: boolean }[];
};

export function groupGenreProviderVariants(variants: readonly GenreProviderVariant[]) {
  const groups = new Map<string, GenreProviderVariantGroup>();
  for (const variant of variants) {
    const key = JSON.stringify([variant.provider, variant.mediaType]);
    const group = groups.get(key) ?? {
      provider: variant.provider, mediaType: variant.mediaType,
      mediaTypeName: variant.mediaTypeName, names: [], variants: [],
    };
    if (!group.names.includes(variant.externalGenreName)) group.names.push(variant.externalGenreName);
    if (variant.mappingId !== undefined && !group.variants?.some((item) => item.name === variant.externalGenreName)) {
      group.variants!.push({ mappingId: variant.mappingId, name: variant.externalGenreName, applying: variant.applying ?? false });
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group, variants: group.variants?.sort((a, b) => a.name.localeCompare(b.name, "ru")), names: [...group.names].sort((a, b) => a.localeCompare(b, "ru")),
  })).sort((a, b) => a.provider.localeCompare(b.provider) || a.mediaType.localeCompare(b.mediaType));
}

export function parseGenreId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

export function parseGenreName(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}
