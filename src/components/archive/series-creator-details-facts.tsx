import { Fragment } from "react";
import { MediaItemCreatorLinks } from "./media-item-creator-links";
import { getStringListFact } from "@/lib/media/metadata-facts";
import type { SeriesCreatorDisplay } from "@/db/queries/tmdb-series-display";

export function SeriesCreatorDetailsFacts({ creators, facts }: {
  creators?: SeriesCreatorDisplay;
  facts?: Record<string, unknown> | null;
}) {
  const fallback = (key: string) => getStringListFact(facts, key).map(name => ({ name, creatorId: null, slug: null }));
  const sections = [
    { label: "Производство", rows: creators?.productionCompanies ?? fallback("productionCompanies") },
    { label: "Вещатели", rows: creators?.networks ?? fallback("networks") },
    { label: "Создатели", rows: creators?.creators ?? [] },
    { label: "Шоураннеры", rows: creators?.showrunners ?? [] },
  ];
  return <>{sections.filter(section => section.rows.length).map(section => <Fragment key={section.label}>
    <span className="mx-1.5" aria-hidden="true">•</span><span className="break-words"><span className="text-stone-500">{section.label}: </span>
      {section.rows.map((creator, index) => <Fragment key={creator.creatorId ?? `pending:${index}`}>
        {index ? ", " : null}
        {creator.creatorId !== null && creator.slug
          ? <MediaItemCreatorLinks creators={[{ id: creator.creatorId, name: creator.name, slug: creator.slug }]} mediaType="series" />
          : creator.name}
      </Fragment>)}
    </span>
  </Fragment>)}</>;
}
