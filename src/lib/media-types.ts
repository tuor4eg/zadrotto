export const MEDIA_TYPES = ["game", "film", "series", "book", "comic", "anime", "other"] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  game: "Игра",
  film: "Фильм",
  series: "Сериал",
  book: "Книга",
  comic: "Комикс",
  anime: "Аниме",
  other: "Другое",
};
