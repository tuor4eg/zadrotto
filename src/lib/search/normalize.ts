export function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
}

export function matchesNormalizedSearch(
  values: readonly (string | null | undefined)[],
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  return values.some(
    (value) => value != null && normalizeSearchText(value).includes(normalizedQuery),
  );
}
