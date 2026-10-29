import { Fragment } from "react";
import { MediaItemCreatorLinks } from "./media-item-creator-links";
import type { EntryRoleCreatorLink } from "@/db/queries/creators";

const ARTIST_WORK = [
  ["penciler", "карандаш"], ["inker", "тушь"], ["colorist", "цвет"], ["letterer", "леттеринг"], ["cover", "обложка"],
] as const;

export function ComicCreatorDetailsFacts({ creators = [], artistWork = [], separatorBefore = false }: {
  creators?: readonly EntryRoleCreatorLink[];
  artistWork?: readonly { creatorId: number; work: readonly string[] }[];
  separatorBefore?: boolean;
}) {
  const sections = [
    { role: "screenwriter", label: "Сценаристы" },
    { role: "artist", label: "Художники" },
    { role: "publisher", label: "Издательство" },
  ].map(section => ({ ...section, creators: creators.filter(creator => creator.roleCode === section.role) }))
    .filter(section => section.creators.length > 0);
  const workByCreator = new Map(artistWork.map(row => [row.creatorId, row.work]));
  const groups = new Map<string, { label: string; creators: EntryRoleCreatorLink[] }>();
  for (const creator of creators.filter(row => row.roleCode === "artist")) {
    const work = workByCreator.get(creator.id) ?? [];
    const label = ARTIST_WORK.filter(([code]) => work.includes(code)).map(([, text]) => text).join(", ");
    const group = groups.get(label) ?? { label, creators: [] };
    group.creators.push(creator);
    groups.set(label, group);
  }
  return <>{sections.map((section, index) => <Fragment key={section.role}>
    {separatorBefore || index > 0 ? <span className="mx-1.5" aria-hidden="true">•</span> : null}
    <span className="break-words"><span className="text-stone-500">{section.label}: </span>
      {section.role === "artist" ? [...groups.values()].map((group, groupIndex) => <Fragment key={group.label}>
        {groupIndex > 0 ? ", " : null}<MediaItemCreatorLinks creators={group.creators} mediaType="comic" />{group.label ? ` (${group.label})` : null}
      </Fragment>) : <MediaItemCreatorLinks creators={section.creators} mediaType="comic" />}
    </span>
  </Fragment>)}</>;
}
