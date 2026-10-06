import { Fragment } from "react";
import Link from "next/link";
import type { MediaItemGenre } from "@/lib/media/genres";

export function MediaItemGenreLinks({ genres }: { genres: readonly MediaItemGenre[] }) {
  return <>{genres.map((genre, index) => <Fragment key={genre.id}>
    {index > 0 ? ", " : null}
    <Link href={`/archive?genre=${encodeURIComponent(genre.slug)}`} className="underline decoration-current/40 underline-offset-4 hover:decoration-current">{genre.name}</Link>
  </Fragment>)}</>;
}
