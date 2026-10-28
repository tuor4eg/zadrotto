import { Fragment } from "react";
import { Clock3, Dices, Palette, PersonStanding, Tags, UsersRound } from "lucide-react";

import { MediaItemGenreLinks } from "@/components/archive/media-item-genre-links";
import { MediaItemCreatorLinks } from "@/components/archive/media-item-creator-links";
import type { EntryRoleCreatorLink } from "@/db/queries/creators";
import { getBoardgameFactValues, getStringListFact } from "@/lib/media/metadata-facts";
import type { MediaItemGenre } from "@/lib/media/genres";

const FACT_PRESENTATION = [
  { key: "authors", label: "Геймдизайнеры", icon: Dices },
  { key: "artists", label: "Художники", icon: Palette },
  { key: "age", label: "Возраст", icon: PersonStanding },
  { key: "players", label: "Число игроков", icon: UsersRound },
  { key: "playingTime", label: "Время партии", icon: Clock3 },
  { key: "type", label: "Тип игры", icon: null },
] as const;

export function BoardgameDetailsFacts({ facts, genres, creators = [], hasUnifiedGenres = genres.length > 0, separatorBefore = false }: {
  facts: Record<string, unknown> | null | undefined;
  genres: readonly MediaItemGenre[];
  creators?: readonly EntryRoleCreatorLink[];
  hasUnifiedGenres?: boolean;
  separatorBefore?: boolean;
}) {
  const values = {
    ...getBoardgameFactValues(facts),
    artists: getStringListFact(facts, "artists").join(", ") || null,
  };
  const linkedDesigners = creators.filter(creator => creator.roleCode === "designer");
  const linkedArtists = creators.filter(creator => creator.roleCode === "artist");
  const structured = facts?.bggCreators !== undefined;
  const contents: Record<string, React.ReactNode> = {
    ...values,
    authors: linkedDesigners.length ? <MediaItemCreatorLinks creators={linkedDesigners} /> : structured ? null : values.authors ? <MediaItemCreatorLinks creators={getStringListFact(facts, "authors").map(name => ({name}))} /> : null,
    artists: linkedArtists.length ? <MediaItemCreatorLinks creators={linkedArtists} /> : structured ? null : values.artists ? <MediaItemCreatorLinks creators={getStringListFact(facts, "artists").map(name => ({name}))} /> : null,
  };
  const providerGenres = !hasUnifiedGenres ? getStringListFact(facts, "genres") : [];
  const entries: { key: string; content: React.ReactNode }[] = FACT_PRESENTATION.flatMap(({ key, label, icon: Icon }) => contents[key] ? [{
    key,
    content: <span title={label} className="break-words">
      {Icon ? <Icon aria-hidden="true" className="mr-1 inline-block size-3.5 align-text-bottom text-stone-500" /> : null}
      <span className="sr-only">{label}: </span>
      {contents[key]}
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
