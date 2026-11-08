import type { ReactNode } from "react";

export function ArchivePageHeading({ title, description, id }: {
  title: string;
  description: ReactNode;
  id?: string;
}) {
  return <div className="media-carrier-font-pc-steam [&_*]:[font-family:inherit]">
    <h1 id={id} className="text-4xl leading-none text-stone-950 sm:text-5xl">{title}</h1>
    <p className="mt-2 text-sm text-stone-600">{description}</p>
  </div>;
}
