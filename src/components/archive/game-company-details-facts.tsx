import { Fragment } from "react";
import { MediaItemCreatorLinks } from "@/components/archive/media-item-creator-links";
import { getStringListFact } from "@/lib/media/metadata-facts";

export type GameCompanyDisplay = {
  externalId: string;
  provider: string;
  name: string;
  roleCode: "developer" | "publisher";
  creatorId: number | null;
  slug: string | null;
};

export function GameCompanyDetailsFacts({ companies, facts, separatorBefore = false }: {
  companies?: readonly GameCompanyDisplay[];
  facts?: Record<string, unknown> | null;
  separatorBefore?: boolean;
}) {
  const groups = ([ ["developer", "developers", "Разработчики"], ["publisher", "publishers", "Издатели"] ] as const).flatMap(([role, key, label]) => {
    const seen = new Set<string>();
    const rows = companies?.filter(company => {
      if (company.roleCode !== role) return false;
      const identity = company.creatorId === null ? `${company.provider}:${company.externalId}` : `creator:${company.creatorId}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
    const content = rows === undefined ? getStringListFact(facts, key).join(", ") : rows.length ? rows.map((company, index) => <Fragment key={`${company.provider}:${company.externalId}`}>
      {index ? ", " : null}
      {company.creatorId !== null && company.slug ? <MediaItemCreatorLinks creators={[{ id: company.creatorId, name: company.name, slug: company.slug }]} /> : company.name}
    </Fragment>) : null;
    return content ? [{ role, label, content }] : [];
  });
  return <>{groups.map(({ role, label, content }, index) => <Fragment key={role}>
    {separatorBefore || index ? <span className="mx-1.5" aria-hidden="true">•</span> : null}
    <span className="break-words"><span className="text-stone-500">{label}: </span>{content}</span>
  </Fragment>)}</>;
}
