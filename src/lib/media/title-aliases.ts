export const DEFAULT_MEDIA_ITEM_TITLE_ALIAS_LIMIT = 3;
export const MIN_MEDIA_ITEM_TITLE_ALIAS_LIMIT = 1;
export const MAX_MEDIA_ITEM_TITLE_ALIAS_LIMIT = 10;

export function normalizeMediaItemTitleAlias(value: string) {
  return value.trim();
}

export function normalizeMediaItemTitleAliases(
  values: readonly string[],
  context?: {
    originalTitle: string | null;
    title: string;
  },
) {
  const seen = new Set(
    context
      ? [context.title, context.originalTitle]
          .flatMap((value) => (value ? [normalizeMediaItemTitleAlias(value).toLowerCase()] : []))
      : [],
  );

  return values.flatMap((value) => {
    const normalized = normalizeMediaItemTitleAlias(value);
    const comparable = normalized.toLowerCase();

    if (!normalized || seen.has(comparable)) {
      return [];
    }

    seen.add(comparable);
    return [normalized];
  });
}

export function parseMediaItemTitleAliasLimit(value: unknown) {
  const limit = typeof value === "number" ? value : Number(value);

  return Number.isInteger(limit) &&
    limit >= MIN_MEDIA_ITEM_TITLE_ALIAS_LIMIT &&
    limit <= MAX_MEDIA_ITEM_TITLE_ALIAS_LIMIT
    ? limit
    : null;
}
