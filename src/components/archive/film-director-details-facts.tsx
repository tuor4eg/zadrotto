import { Fragment } from "react";
import { MediaItemCreatorLinks } from "@/components/archive/media-item-creator-links";
import type { FilmDirectorDisplay } from "@/db/queries/tmdb-director-display";

export function FilmDirectorDetailsFacts({ directors }: {
  directors?: readonly FilmDirectorDisplay[];
}) {
  if (!directors?.length) return null;
  return <><span className="mx-1.5" aria-hidden="true">•</span><span className="break-words"><span className="text-stone-500">Режиссёры: </span>
    {directors.map((director, index) => <Fragment key={director.creatorId ?? `pending:${index}`}>
      {index ? ", " : null}
      {director.creatorId !== null && director.slug
        ? <MediaItemCreatorLinks creators={[{ id: director.creatorId, name: director.name, slug: director.slug }]} mediaType="film" />
        : director.name}
    </Fragment>)}
  </span></>;
}
