import { normalizeSearchText } from "@/lib/search/normalize";

export type MediaItemGenre = { id: number; slug: string; name: string };
export type ExternalGenre = { name: string; normalizedName: string; id: string | null };
export type GenreMapping = {
  externalGenreId: string | null;
  normalizedExternalGenreName: string;
  genre: MediaItemGenre;
  isActive: boolean;
};

export function isValidGenreReferences(value: unknown): value is { id: string; name: string }[] {
  return Array.isArray(value) && value.every((entry) =>
    entry !== null && typeof entry === "object" &&
    "id" in entry && typeof entry.id === "string" && entry.id.trim() !== "" &&
    "name" in entry && typeof entry.name === "string" && entry.name.trim() !== "",
  );
}

/** Provider names stay whole: punctuation is part of several real genre names. */
export function extractExternalGenres(facts: Record<string, unknown>): ExternalGenre[] {
  const value = facts.genres;
  const values = value == null ? [] : typeof value === "string" ? [value] : value;
  if (!Array.isArray(values) || values.some((name) => typeof name !== "string")) {
    throw new Error("Invalid provider genres: expected strings or a string array");
  }
  const references = facts.genreReferences;
  if (references !== undefined && !isValidGenreReferences(references)) {
    throw new Error("Invalid provider genre references");
  }
  const idsByName = new Map<string, string>();
  for (const reference of references ?? []) {
    const normalizedName = normalizeSearchText(reference.name);
    const id = reference.id.trim();
    if (idsByName.has(normalizedName) && idsByName.get(normalizedName) !== id) {
      throw new Error("Ambiguous provider genre references");
    }
    idsByName.set(normalizedName, id);
  }
  const genresByName = new Map<string, ExternalGenre>();
  for (const name of values as string[]) {
    const normalizedName = normalizeSearchText(name);
    if (normalizedName && !genresByName.has(normalizedName)) {
      genresByName.set(normalizedName, {
        name: name.trim(), normalizedName, id: idsByName.get(normalizedName) ?? null,
      });
    }
  }
  if ([...idsByName.keys()].some((name) => !genresByName.has(name))) {
    throw new Error("Provider genre reference has no matching raw genre");
  }
  return [...genresByName.values()];
}

export function isExcludedExternalGenre(provider: string | null, mediaType: string, name: string) {
  return provider === "tmdb" && mediaType === "film" &&
    ["телевизионный фильм", "tv movie"].includes(normalizeSearchText(name));
}

export function resolveGenreMappings(input: {
  externalGenres: readonly ExternalGenre[];
  mappings: readonly GenreMapping[];
  provider: string | null;
  mediaType: string;
  excludedNames?: readonly string[];
}) {
  const genresById = new Map<number, MediaItemGenre>();
  const unmapped: ExternalGenre[] = [];
  for (const external of input.externalGenres) {
    if (input.excludedNames === undefined ? isExcludedExternalGenre(input.provider, input.mediaType, external.name) : input.excludedNames.includes(external.normalizedName)) continue;
    const byId = external.id === null ? [] : input.mappings.filter(
      (mapping) => mapping.externalGenreId === external.id,
    );
    const matches = byId.length > 0 ? byId : input.mappings.filter(
      (mapping) => mapping.normalizedExternalGenreName === external.normalizedName,
    );
    if (matches.length === 0) unmapped.push(external);
    for (const mapping of matches) {
      if (mapping.isActive) genresById.set(mapping.genre.id, mapping.genre);
    }
  }
  const genres = [...genresById.values()].sort((a, b) =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : a.id - b.id,
  );
  return { genres, unmapped };
}

/** Keep only stable, technical IDs in raw references; the provider names stay unchanged. */
export function getProviderGenreReferences(values: readonly { id?: number; name?: string }[] | undefined) {
  return (values ?? []).flatMap((entry) =>
    Number.isSafeInteger(entry.id) && entry.id! > 0 && entry.name?.trim()
      ? [{ id: String(entry.id), name: entry.name.trim() }]
      : [],
  );
}
