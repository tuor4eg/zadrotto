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

function getNonEmptyStringFact(
  facts: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = facts?.[key];

  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
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
    const genres = getStringListFact(facts, "genres");
    const productionCompanies = getStringListFact(facts, "productionCompanies");
    details = [
      runtime ? `${runtime} мин.` : null,
      genres.length > 0 ? genres.join(", ") : null,
      productionCompanies.length > 0 ? productionCompanies.join(", ") : null,
    ].filter((value): value is string => Boolean(value));
  } else if (item.mediaType === "game") {
    const developers = getStringListFact(facts, "developers");
    const genres = getStringListFact(facts, "genres");
    details = [
      developers.length > 0 ? formatFactList(developers) : null,
      genres.length > 0 ? formatFactList(genres) : null,
    ].filter((value): value is string => Boolean(value));
  } else if (item.mediaType === "book") {
    const authors = formatAuthorsFact(facts);
    details = authors ? [authors] : [];
  } else if (item.mediaType === "comic") {
    const authors = formatAuthorsFact(facts);
    const issues = getPositiveIntegerFact(facts, "issueCount");
    const publisher = getNonEmptyStringFact(facts, "publisher");
    details = [
      authors,
      issues
        ? formatPluralCount(issues, { one: "выпуск", few: "выпуска", many: "выпусков" })
        : null,
      publisher,
    ].filter((value): value is string => Boolean(value));
  } else if (item.mediaType === "series") {
    const seasons = getPositiveIntegerFact(facts, "seasonCount");
    const episodes = getPositiveIntegerFact(facts, "episodeCount");
    const runtime = getPositiveIntegerFact(facts, "averageEpisodeRuntimeMinutes");
    const genres = getStringListFact(facts, "genres");
    const networks = getStringListFact(facts, "networks");
    details = [
      seasons
        ? formatPluralCount(seasons, { one: "сезон", few: "сезона", many: "сезонов" })
        : null,
      episodes
        ? formatPluralCount(episodes, { one: "серия", few: "серии", many: "серий" })
        : null,
      runtime ? `${runtime} мин./серия` : null,
      genres.length > 0 ? genres.join(", ") : null,
      networks.length > 0 ? networks.join(", ") : null,
    ].filter((value): value is string => Boolean(value));
  } else if (item.mediaType === "anime") {
    const animeType = getNonEmptyStringFact(facts, "animeType");
    const isMovie = animeType?.toUpperCase() === "MOVIE";
    const episodes = getPositiveIntegerFact(facts, "episodeCount");
    const runtime = getPositiveIntegerFact(facts, "averageEpisodeRuntimeMinutes");
    const studios = getStringListFact(facts, "studios");
    const genres = getStringListFact(facts, "genres");
    details = [
      animeType,
      isMovie
        ? runtime
          ? `${runtime} мин.`
          : null
        : episodes
          ? formatPluralCount(episodes, { one: "серия", few: "серии", many: "серий" })
          : null,
      studios.length > 0 ? studios.join(", ") : null,
      genres.length > 0 ? genres.join(", ") : null,
    ].filter((value): value is string => Boolean(value));
  }

  return [item.mediaTypeLabel, year, ...details].filter(
    (value): value is string => Boolean(value),
  );
}

export function formatMediaItemSummary(item: MediaItemSummaryInput) {
  return getMediaItemSummaryParts(item).join(" · ");
}
