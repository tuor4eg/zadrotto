import type { AuthorDigitalProfile } from "@/db/queries/author-digital-profile";

export const MATURE_AUTHOR_RESEARCH_RATINGS_COUNT = 25;

export type AuthorResearchMessage = {
  body: string;
  cta: {
    href: string;
    label: string;
  };
  key: string;
  maturity: "early" | "mature";
  title: string;
};

type AuthorResearchMessageInput = {
  authorId: number;
  averageScore: number | null;
  contributionCount: number;
  digitalProfile: AuthorDigitalProfile;
  ratingsCount: number;
  reviewCount: number;
};

type MessageCandidate = Omit<AuthorResearchMessage, "maturity">;

const mediaTypeGenitivePluralByCode: Readonly<Record<string, string>> = {
  anime: "аниме",
  book: "книг",
  comic: "комиксов",
  film: "фильмов",
  game: "игр",
  other: "других записей",
  roblox: "игр Roblox",
  series: "сериалов",
};

function formatMediaType(code: string, name: string) {
  return mediaTypeGenitivePluralByCode[code] ?? name.toLocaleLowerCase("ru-RU");
}

function formatCount(
  count: number,
  labels: { few: string; many: string; one: string },
) {
  const category = new Intl.PluralRules("ru-RU").select(count);
  const label = category === "one" ? labels.one : category === "few" ? labels.few : labels.many;
  return `${count.toLocaleString("ru-RU")} ${label}`;
}

function getSelectionValue(input: AuthorResearchMessageInput) {
  const profile = input.digitalProfile;
  return (
    input.authorId
    + input.ratingsCount
    + input.reviewCount * 3
    + input.contributionCount * 5
    + Math.round((input.averageScore ?? 0) * 10)
    + profile.strongestSeriesCount * 7
    + profile.seriesRated * 11
    + (profile.strongestSeries?.id ?? 0) * 13
    + (profile.activeSeries?.id ?? 0) * 17
  ) >>> 0;
}

function getEarlyCandidates(input: AuthorResearchMessageInput): MessageCandidate[] {
  const candidates: MessageCandidate[] = input.ratingsCount > 0
    ? [{
        body: `В архиве уже ${formatCount(input.ratingsCount, { one: "оценка", few: "оценки", many: "оценок" })}. Этого достаточно, чтобы появились первые ориентиры, но впереди ещё много новых направлений.`,
        cta: { href: "/archive", label: "Продолжить исследование" },
        key: "early-progress",
        title: "Архив начинает складываться",
      }]
    : [{
        body: "В архиве появились первые следы твоего участия. Следующий шаг поможет ему стать подробнее и разнообразнее.",
        cta: { href: "/archive", label: "Продолжить исследование" },
        key: "early-start",
        title: "История только начинается",
      }];
  const activeSeries = input.digitalProfile.activeSeries;

  if (
    activeSeries
    && input.digitalProfile.seriesRated > 0
    && input.digitalProfile.seriesTotal > input.digitalProfile.seriesRated
  ) {
    candidates.push({
      body: `В серии «${activeSeries.title}» тебе знакомо ${input.digitalProfile.seriesRated} из ${input.digitalProfile.seriesTotal} записей. Можно продолжить с уже намеченного маршрута.`,
      cta: { href: `/series/${activeSeries.code}`, label: "Продолжить эту серию" },
      key: "early-active-series",
      title: "Есть знакомый маршрут",
    });
  }

  if (input.reviewCount > 0) {
    candidates.push({
      body: `В твоём архиве уже ${formatCount(input.reviewCount, { one: "опубликованная рецензия", few: "опубликованные рецензии", many: "опубликованных рецензий" })}. Оценки отмечают впечатления, а тексты сохраняют, почему они такими стали.`,
      cta: { href: "/author/reviews", label: "Открыть мои рецензии" },
      key: "early-reviews",
      title: "Появились первые заметки",
    });
  }

  if (input.contributionCount > 0) {
    candidates.push({
      body: `Ты добавил в архив ${formatCount(input.contributionCount, { one: "запись", few: "записи", many: "записей" })}. Теперь здесь остаются не только оценки, но и найденные тобой вещи.`,
      cta: { href: "/author/media", label: "Открыть мои записи" },
      key: "early-contributions",
      title: "Архив пополняется находками",
    });
  }

  return candidates;
}

function getMatureCandidates(input: AuthorResearchMessageInput): MessageCandidate[] {
  const profile = input.digitalProfile;
  const candidates: MessageCandidate[] = [];

  if (profile.strongestSeries && profile.strongestSeriesCount > 0) {
    candidates.push({
      body: `Серия «${profile.strongestSeries.title}» встречается в твоём архиве особенно часто: знакомы уже ${formatCount(profile.strongestSeriesCount, { one: "запись", few: "записи", many: "записей" })}.`,
      cta: { href: `/series/${profile.strongestSeries.code}`, label: "Открыть эту серию" },
      key: "mature-strongest-series",
      title: "У архива появились ориентиры",
    });
  }

  if (profile.bestKnownType) {
    candidates.push({
      body: `Больше всего в твоём архиве ${formatMediaType(profile.bestKnownType.code, profile.bestKnownType.name)}. Это уже заметное направление, но внутри него наверняка остались неожиданные находки.`,
      cta: {
        href: `/archive?type=${encodeURIComponent(profile.bestKnownType.code)}`,
        label: "Продолжить знакомое направление",
      },
      key: "mature-best-known-type",
      title: "Знакомая территория",
    });
  }

  if (profile.activeSeries && profile.seriesRated > 0 && profile.seriesTotal > profile.seriesRated) {
    candidates.push({
      body: `В серии «${profile.activeSeries.title}» тебе знакомо ${profile.seriesRated} из ${profile.seriesTotal} записей. До завершённой картины осталось совсем немного — или целая новая ветка.`,
      cta: { href: `/series/${profile.activeSeries.code}`, label: "Продолжить эту серию" },
      key: "mature-active-series",
      title: "Одна серия ещё зовёт",
    });
  }

  if (profile.unexploredType) {
    candidates.push({
      body: `Среди знакомых серий меньше всего исследовано направление ${formatMediaType(profile.unexploredType.code, profile.unexploredType.name)}. Хорошее место, чтобы свернуть с привычного маршрута.`,
      cta: {
        href: `/archive?type=${encodeURIComponent(profile.unexploredType.code)}`,
        label: "Открыть неизведанное",
      },
      key: "mature-unexplored-type",
      title: "Рядом осталось неизведанное",
    });
  }

  return candidates.length > 0 ? candidates : getEarlyCandidates(input);
}

export function getAuthorResearchMessage(
  input: AuthorResearchMessageInput,
): AuthorResearchMessage {
  const maturity = input.ratingsCount >= MATURE_AUTHOR_RESEARCH_RATINGS_COUNT
    ? "mature"
    : "early";
  const candidates = maturity === "mature"
    ? getMatureCandidates(input)
    : getEarlyCandidates(input);
  const selected = candidates[getSelectionValue(input) % candidates.length];

  return { ...selected, maturity };
}
