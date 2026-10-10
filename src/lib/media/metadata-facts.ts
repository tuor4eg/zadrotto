export function decodeBggNumericEntities(value: string) {
  return value.replace(/&#(x[\da-f]+|\d+);/gi, (entity, code: string) => {
    const point = code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number(code);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point) : entity;
  });
}

export function getStringListFact(
  facts: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = facts?.[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => {
          if (typeof item !== "string") return "";
          return (facts?.bggItemType ? decodeBggNumericEntities(item) : item).trim();
        })
        .filter(Boolean),
    ),
  ];
}

export function formatFactList(values: string[], maxVisibleItems = 3) {
  if (values.length <= maxVisibleItems) {
    return values.join(", ");
  }

  return `${values.slice(0, maxVisibleItems).join(", ")} +${values.length - maxVisibleItems}`;
}

export function formatAuthorsFact(facts: Record<string, unknown> | null | undefined) {
  const authors = getStringListFact(facts, "authors");

  return authors.length > 0 ? formatFactList(authors) : null;
}

export function getDateFactYear(
  facts: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = facts?.[key];

  return typeof value === "string" ? value.match(/^(\d{4})/)?.[1] ?? null : null;
}

function positiveIntegerFact(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function formatBoardgameRange(minimum: unknown, maximum: unknown) {
  const min = positiveIntegerFact(minimum);
  const max = positiveIntegerFact(maximum);
  if (min !== null && max !== null) return min > max ? null : min === max ? String(min) : `${min}–${max}`;
  if (min !== null) return `от ${min}`;
  if (max !== null) return `до ${max}`;
  return null;
}

export function getBoardgameFactValues(facts: Record<string, unknown> | null | undefined) {
  const authors = getStringListFact(facts, "authors");
  const age = positiveIntegerFact(facts?.minAge);
  const runtime = positiveIntegerFact(facts?.runtimeMinutes);
  const playingTime = formatBoardgameRange(facts?.minPlayingTimeMinutes, facts?.maxPlayingTimeMinutes)
    ?? (runtime !== null ? String(runtime) : null);
  return {
    authors: authors.length > 0 ? authors.join(", ") : null,
    age: age !== null ? `${age}+` : null,
    players: formatBoardgameRange(facts?.minPlayers, facts?.maxPlayers),
    playingTime: playingTime !== null ? `${playingTime} мин.` : null,
    type: facts?.bggItemType === "boardgameexpansion" ? "Дополнение"
      : facts?.bggItemType === "boardgame" ? "Самостоятельная игра" : null,
  };
}
