import { Fragment } from "react";
import { MediaItemCreatorLinks } from "./media-item-creator-links";
import { getStringListFact } from "@/lib/media/metadata-facts";
import type { AnimeCreatorDisplay } from "@/db/queries/anilist-creator-display";

export function AnimeCreatorDetailsFacts({ creators, facts }: {
  creators?: AnimeCreatorDisplay;
  facts?: Record<string, unknown> | null;
}) {
  const fallback = (key: string) => getStringListFact(facts, key).map(name => ({ name, creatorId: null, slug: null }));
  const productionCompanies = creators?.productionCompanies ?? [];
  const showLegacyStudios = facts?.anilistCreatorsComplete !== true && productionCompanies.length === 0;
  const sections = [
    { label: "Режиссёры", rows: creators?.directors ?? [] },
    { label: "Производственные компании", rows: showLegacyStudios ? fallback("studios") : productionCompanies },
    { label: "Продюсеры", rows: creators?.producers ?? [] },
  ];
  return <>{sections.filter(section => section.rows.length).map(section => <Fragment key={section.label}>
    <span className="mx-1.5" aria-hidden="true">•</span><span className="break-words"><span className="text-stone-500">{section.label}: </span>
      <MediaItemCreatorLinks creators={section.rows.map(creator => ({id:creator.creatorId,name:creator.name,slug:creator.creatorId !== null ? creator.slug : null}))} mediaType="anime" />
    </span>
  </Fragment>)}</>;
}
