export const SERIES_DIGIT_GROUP = "0-9";
export const SERIES_OTHER_GROUP = "#";

export function getSeriesAlphabetGroup(title: string) {
  const firstCharacter = Array.from(title.trim())[0]?.toLocaleUpperCase("ru-RU");

  if (!firstCharacter) return SERIES_OTHER_GROUP;
  if (/\d/u.test(firstCharacter)) return SERIES_DIGIT_GROUP;
  if (/[А-ЯЁ]/u.test(firstCharacter) || /[A-Z]/u.test(firstCharacter)) return firstCharacter;

  return SERIES_OTHER_GROUP;
}

export function compareSeriesAlphabetGroups(left: string, right: string) {
  const getGroupRank = (group: string) => {
    if (group === SERIES_DIGIT_GROUP) return 0;
    if (/[А-ЯЁ]/u.test(group)) return 1;
    if (/[A-Z]/u.test(group)) return 2;
    return 3;
  };
  const rankDifference = getGroupRank(left) - getGroupRank(right);

  return rankDifference || left.localeCompare(right, "ru-RU");
}

export function getSeriesCountTier(count: number) {
  if (count >= 20) return "large" as const;
  if (count >= 5) return "medium" as const;

  return "small" as const;
}
