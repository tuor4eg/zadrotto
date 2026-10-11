type EntryGroupSummaryItem = {
  mediaType: string;
  mediaTypeName: string;
  metadataFacts: Record<string, unknown> | null;
};

const TYPE_FORMS: Record<string, readonly [string, string, string]> = {
  film: ["фильм", "фильма", "фильмов"],
  series: ["сериал", "сериала", "сериалов"],
  game: ["игра", "игры", "игр"],
  book: ["книга", "книги", "книг"],
  comic: ["комикс", "комикса", "комиксов"],
  anime: ["аниме", "аниме", "аниме"],
  boardgame: ["настольная игра", "настольные игры", "настольных игр"],
};
const pluralRules = new Intl.PluralRules("ru-RU");

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function getViewingMinutes(item: EntryGroupSummaryItem): number | null {
  const facts = item.metadataFacts;
  if (item.mediaType === "film") return positiveInteger(facts?.runtimeMinutes);
  if (item.mediaType !== "series" && item.mediaType !== "anime") return null;
  const runtime = positiveInteger(facts?.averageEpisodeRuntimeMinutes);
  if (item.mediaType === "anime" && typeof facts?.animeType === "string"
    && facts.animeType.toUpperCase() === "MOVIE") return runtime;
  const episodes = positiveInteger(facts?.episodeCount);
  return runtime !== null && episodes !== null ? positiveInteger(runtime * episodes) : null;
}

export function getEntryGroupSummary(items: readonly EntryGroupSummaryItem[]) {
  const types = new Map<string, { count: number; name: string }>();
  let totalMinutes: number | null = items.length ? 0 : null;
  let hasOpenSeries = false;
  for (const item of items) {
    const previous = types.get(item.mediaType);
    types.set(item.mediaType, { count: (previous?.count ?? 0) + 1, name: item.mediaTypeName });
    const minutes = getViewingMinutes(item);
    totalMinutes = totalMinutes !== null && minutes !== null
      && Number.isSafeInteger(totalMinutes + minutes) ? totalMinutes + minutes : null;
    if (item.mediaType === "series" && positiveInteger(item.metadataFacts?.lastAirYear) === null) {
      hasOpenSeries = true;
    }
  }
  const composition = [...types].map(([code, { count, name }]) => {
    const forms = Object.hasOwn(TYPE_FORMS, code) ? TYPE_FORMS[code] : undefined;
    if (!forms) return `${name}: ${count}`;
    const category = pluralRules.select(count);
    return `${count} ${forms[category === "one" ? 0 : category === "few" ? 1 : 2]}`;
  }).join(" · ");
  const hours = totalMinutes === null ? 0 : Math.floor(totalMinutes / 60);
  const minutes = totalMinutes === null ? 0 : totalMinutes % 60;
  const duration = totalMinutes === null ? null : [
    hours ? `${hours} ч` : null,
    minutes ? `${minutes} мин` : null,
  ].filter(Boolean).join(" ");
  const durationLabel = duration && hasOpenSeries ? `${duration} по данным каталога` : duration;
  return {
    composition,
    totalMinutes,
    durationLabel,
    label: [composition, durationLabel].filter(Boolean).join(" · "),
  };
}
