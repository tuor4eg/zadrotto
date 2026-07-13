import { formatAuthorsFact, formatFactList, getStringListFact } from "@/lib/media/metadata-facts";

type MediaItemSummaryInput = {
  mediaType: string;
  mediaTypeLabel: string;
  metadataFacts?: Record<string, unknown> | null;
  releaseYear: number | null;
};

function getPositiveIntegerFact(
  facts: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = facts?.[key];

  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function formatPluralCount(value: number, labels: { one: string; few: string; many: string }) {
  const plural = new Intl.PluralRules("ru-RU").select(value);
  const label = plural === "one" ? labels.one : plural === "few" ? labels.few : labels.many;

  return `${value} ${label}`;
}

function formatAirYears(firstAirYear: number | null, lastAirYear: number | null) {
  if (firstAirYear && lastAirYear) {
    return firstAirYear === lastAirYear ? String(firstAirYear) : `${firstAirYear}-${lastAirYear}`;
  }

  if (firstAirYear) return `с ${firstAirYear}`;
  if (lastAirYear) return `до ${lastAirYear}`;
  return null;
}

export function getMediaItemSummaryParts(item: MediaItemSummaryInput) {
  const facts = item.metadataFacts;
  const year =
    item.mediaType === "series"
      ? formatAirYears(
          getPositiveIntegerFact(facts, "firstAirYear"),
          getPositiveIntegerFact(facts, "lastAirYear"),
        ) ?? (item.releaseYear ? String(item.releaseYear) : null)
      : item.releaseYear
        ? String(item.releaseYear)
        : null;
  let details: string[] = [];

  if (item.mediaType === "film") {
    const runtime = getPositiveIntegerFact(facts, "runtimeMinutes");
    details = runtime ? [`${runtime} мин.`] : [];
  } else if (item.mediaType === "game") {
    const developers = getStringListFact(facts, "developers");
    const genres = getStringListFact(facts, "genres");
    details = [
      developers.length > 0 ? formatFactList(developers) : null,
      genres.length > 0 ? formatFactList(genres) : null,
    ].filter((value): value is string => Boolean(value));
  } else if (item.mediaType === "book" || item.mediaType === "comic") {
    const authors = formatAuthorsFact(facts);
    details = authors ? [authors] : [];
  } else if (item.mediaType === "series") {
    const seasons = getPositiveIntegerFact(facts, "seasonCount");
    const episodes = getPositiveIntegerFact(facts, "episodeCount");
    const runtime = getPositiveIntegerFact(facts, "averageEpisodeRuntimeMinutes");
    details = [
      seasons
        ? formatPluralCount(seasons, { one: "сезон", few: "сезона", many: "сезонов" })
        : null,
      episodes
        ? formatPluralCount(episodes, { one: "серия", few: "серии", many: "серий" })
        : null,
      runtime ? `${runtime} мин./серия` : null,
    ].filter((value): value is string => Boolean(value));
  }

  return [item.mediaTypeLabel, year, ...details].filter(
    (value): value is string => Boolean(value),
  );
}

export function formatMediaItemSummary(item: MediaItemSummaryInput) {
  return getMediaItemSummaryParts(item).join(" · ");
}
