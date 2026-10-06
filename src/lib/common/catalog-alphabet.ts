export const CATALOG_DIGIT_GROUP = "0-9";
export const CATALOG_OTHER_GROUP = "#";

export function getCatalogAlphabetGroup(title: string) {
  const firstCharacter = Array.from(title.trim())[0]?.toLocaleUpperCase("ru-RU");

  if (!firstCharacter) return CATALOG_OTHER_GROUP;
  if (/\d/u.test(firstCharacter)) return CATALOG_DIGIT_GROUP;
  if (/[А-ЯЁ]/u.test(firstCharacter) || /[A-Z]/u.test(firstCharacter)) return firstCharacter;

  return CATALOG_OTHER_GROUP;
}

export function compareCatalogAlphabetGroups(left: string, right: string) {
  const getGroupRank = (group: string) => {
    if (group === CATALOG_DIGIT_GROUP) return 0;
    if (/[А-ЯЁ]/u.test(group)) return 1;
    if (/[A-Z]/u.test(group)) return 2;
    return 3;
  };
  const rankDifference = getGroupRank(left) - getGroupRank(right);

  return rankDifference || left.localeCompare(right, "ru-RU");
}

export function getCatalogCountTier(count: number) {
  if (count >= 20) return "large" as const;
  if (count >= 5) return "medium" as const;

  return "small" as const;
}
