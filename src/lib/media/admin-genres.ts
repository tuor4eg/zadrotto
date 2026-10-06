export type GenreProviderVariant = {
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
};

export function groupGenreProviderVariants(variants: readonly GenreProviderVariant[]) {
  const groups = new Map<string, GenreProviderVariantGroup>();
  for (const variant of variants) {
    const key = JSON.stringify([variant.provider, variant.mediaType]);
    const group = groups.get(key) ?? {
      provider: variant.provider, mediaType: variant.mediaType,
      mediaTypeName: variant.mediaTypeName, names: [],
    };
    if (!group.names.includes(variant.externalGenreName)) group.names.push(variant.externalGenreName);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group, names: [...group.names].sort((a, b) => a.localeCompare(b, "ru")),
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
