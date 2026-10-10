import { Fragment } from "react";
import { Clock3, PersonStanding, Tags, UsersRound } from "lucide-react";

import { MediaItemGenreLinks } from "@/components/archive/media-item-genre-links";
import { getBoardgameFactValues, getStringListFact } from "@/lib/media/metadata-facts";
import type { MediaItemGenre } from "@/lib/media/genres";

const FACT_PRESENTATION = [
  { key: "authors", label: "Автор", icon: null },
  { key: "age", label: "Возраст", icon: PersonStanding },
  { key: "players", label: "Число игроков", icon: UsersRound },
  { key: "playingTime", label: "Время партии", icon: Clock3 },
  { key: "type", label: "Тип игры", icon: null },
] as const;

export function BoardgameDetailsFacts({ facts, genres, separatorBefore = false }: {
  facts: Record<string, unknown> | null | undefined;
  genres: readonly MediaItemGenre[];
  separatorBefore?: boolean;
}) {
  const values = getBoardgameFactValues(facts);
  const providerGenres = genres.length === 0 ? getStringListFact(facts, "genres") : [];
  const entries: { key: string; content: React.ReactNode }[] = FACT_PRESENTATION.flatMap(({ key, label, icon: Icon }) => values[key] ? [{
    key,
    content: <span title={label} className="break-words">
      {Icon ? <Icon aria-hidden="true" className="mr-1 inline-block size-3.5 align-text-bottom text-stone-500" /> : null}
      <span className="sr-only">{label}: </span>
      {values[key]}
    </span>,
  }] : []);
  if (genres.length > 0 || providerGenres.length > 0) entries.push({
    key: "genres",
    content: <span title="Жанры" className="break-words">
      <Tags aria-hidden="true" className="mr-1 inline-block size-3.5 align-text-bottom text-stone-500" />
      <span className="sr-only">Жанры: </span>
      {genres.length > 0 ? <MediaItemGenreLinks genres={genres} /> : providerGenres.join(", ")}
    </span>,
  });
  if (entries.length === 0) return null;
  return <>{entries.map(({ key, content }, index) => (
    <Fragment key={key}>
      {separatorBefore || index > 0 ? <span className="mx-1.5" aria-hidden="true">•</span> : null}
      {content}
    </Fragment>
  ))}</>;
}
