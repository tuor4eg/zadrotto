import { MediaItemCreatorLinks } from "@/components/archive/media-item-creator-links";
import { getStringListFact } from "@/lib/media/metadata-facts";
import type { FilmCompanyDisplay } from "@/db/queries/tmdb-company-display";

export function FilmCompanyDetailsFacts({ companies, facts }: {
  companies?: readonly FilmCompanyDisplay[];
  facts?: Record<string, unknown> | null;
}) {
  const rows = companies ?? getStringListFact(facts, "productionCompanies").map(name => ({ name, creatorId: null, slug: null }));
  if (!rows.length) return null;
  return <><span className="mx-1.5" aria-hidden="true">•</span><span className="break-words"><span className="text-stone-500">Производство: </span>
    <MediaItemCreatorLinks creators={rows.map(company => ({id:company.creatorId,name:company.name,slug:company.creatorId !== null ? company.slug : null}))} mediaType="film" />
  </span></>;
}
