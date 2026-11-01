import { Fragment } from "react";
import { MediaItemCreatorLinks } from "./media-item-creator-links";
import type { EntryRoleCreatorLink } from "@/db/queries/creators";

export function MangaCreatorDetailsFacts({ creators = [], separatorBefore = false }: {
  creators?: readonly EntryRoleCreatorLink[];
  separatorBefore?: boolean;
}) {
  const sections = [
    { role: "writer", label: "Авторы" },
    { role: "artist", label: "Художники" },
    { role: "publisher", label: "Издательства" },
  ].map(section => ({ ...section, creators: creators.filter(creator => creator.roleCode === section.role) }))
    .filter(section => section.creators.length > 0);
  return <>{sections.map((section, index) => <Fragment key={section.role}>
    {separatorBefore || index > 0 ? <span className="mx-1.5" aria-hidden="true">•</span> : null}
    <span className="break-words"><span className="text-stone-500">{section.label}: </span>
      <MediaItemCreatorLinks creators={section.creators} mediaType="manga" />
    </span>
  </Fragment>)}</>;
}
