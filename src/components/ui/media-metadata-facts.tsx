import { BggAttribution } from "@/components/ui/bgg-attribution";
import type { MediaItemGenre } from "@/lib/media/genres";
import { getStringListFact } from "@/lib/media/metadata-facts";

export type MediaMetadataFactsValue = {
  facts: Record<string, unknown>;
  sourceProvider: string | null;
  sourceExternalId: string | null;
  sourceUrl: string | null;
  fetchedAt?: Date | string | null;
  genres?: MediaItemGenre[];
};

const FACT_LABELS: Record<string, string> = {
  alternateNames: "Альтернативные названия",
  artists: "Художники",
  mechanics: "Механики",
  minPlayers: "Минимум игроков",
  maxPlayers: "Максимум игроков",
  minPlayingTimeMinutes: "Минимальное время партии",
  maxPlayingTimeMinutes: "Максимальное время партии",
  minAge: "Возраст от",
  bggItemType: "Тип настольной игры",
  animeType: "Формат",
  authors: "Авторы",
  averageEpisodeRuntimeMinutes: "Средняя длительность серии",
  developers: "Разработчики",
  episodeCount: "Серий",
  firstAirYear: "Первый год эфира",
  universeId: "Universe ID",
  rootPlaceId: "Root Place ID",
  creatorId: "ID создателя",
  creatorName: "Создатель",
  creatorType: "Тип создателя",
  createdAt: "Создано в Roblox",
  updatedAt: "Обновлено в Roblox",
  lastAirYear: "Последний год эфира",
  networks: "Каналы/сети",
  originalLanguage: "Язык оригинала",
  platforms: "Платформы",
  productionCompanies: "Производственные компании",
  productionCountries: "Страны производства",
  publishers: "Издатели",
  runtimeMinutes: "Длительность",
  seasonCount: "Сезонов",
  status: "Статус",
  studios: "Студии",
};

function isPresentFactValue(value: unknown) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some(isPresentFactValue);
  }

  return true;
}

function formatFactValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter(isPresentFactValue).map(formatFactValue).join(", ");
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function getFactLabel(key: string) {
  return FACT_LABELS[key] ?? key;
}

function formatFactEntry(key: string, value: unknown) {
  const formattedValue = formatFactValue(value);

  if (key === "runtimeMinutes" || key === "averageEpisodeRuntimeMinutes" || key === "minPlayingTimeMinutes" || key === "maxPlayingTimeMinutes") {
    return `${formattedValue} мин.`;
  }

  if (key === "bggItemType") {
    return value === "boardgameexpansion" ? "Дополнение" : value === "boardgame" ? "Самостоятельная игра" : formattedValue;
  }

  if (key === "minAge") return `${formattedValue}+`;

  return formattedValue;
}

const RAW_GENRE_KEYS = new Set(["genres", "genreReferences", "genre", "genreLevel1", "genreLevel2"]);

function getFactEntries(facts: Record<string, unknown>) {
  return Object.entries(facts)
    .filter(([key, value]) => !RAW_GENRE_KEYS.has(key) && isPresentFactValue(value))
    .map(([key, value]) => ({
      key,
      label: getFactLabel(key),
      value: formatFactEntry(key, value),
    }));
}

export function MediaMetadataFacts({
  metadata,
  genres = metadata?.genres ?? [],
  showProviderGenres = false,
}: {
  metadata: MediaMetadataFactsValue | null;
  genres?: readonly MediaItemGenre[];
  showProviderGenres?: boolean;
}) {
  const entries = metadata ? getFactEntries(metadata.facts) : [];
  if (genres.length > 0) entries.push({ key: "genres", label: "Жанры", value: genres.map((genre) => genre.name).join(", ") });
  const providerGenres = showProviderGenres ? getStringListFact(metadata?.facts, "genres") : [];
  if (providerGenres.length > 0) entries.push({ key: "providerGenres", label: "Жанры провайдера", value: providerGenres.join(", ") });

  if (entries.length === 0 && !metadata?.sourceProvider && !metadata?.sourceUrl) {
    return null;
  }

  return (
    <section className="rounded-md border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-stone-950">Факты</h3>
        {metadata?.sourceProvider === "bgg" ? <BggAttribution /> : metadata?.sourceProvider ? (
          <span className="rounded border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600">
            {metadata.sourceProvider}
          </span>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {entries.map((entry) => (
            <div key={entry.key}>
              <dt className="text-xs text-stone-500">{entry.label}</dt>
              <dd className="mt-0.5 text-sm text-stone-900">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {metadata?.sourceUrl ? (
        <a
          href={metadata.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-xs text-stone-500 underline-offset-4 hover:text-stone-900 hover:underline"
        >
          Источник
        </a>
      ) : null}
    </section>
  );
}
