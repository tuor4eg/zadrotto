import Link from "next/link";
import { Fragment } from "react";

import type { MediaItemFranchiseLink } from "@/db/queries/media-items";

type MediaItemFranchiseLinksProps = {
  className: string;
  containerClassName: string;
  franchises: MediaItemFranchiseLink[];
  trailingAction?: React.ReactNode;
};

type SeriesPart = { id: number; code: string; title: string };
type SeriesBranch = { part: SeriesPart; children: Map<number, SeriesBranch> };

function groupPublishedPaths(franchises: MediaItemFranchiseLink[]) {
  const roots = new Map<number, SeriesBranch>();
  for (const franchise of franchises) {
    if (franchise.publicationStatus !== "published") continue;
    let level = roots;
    for (const part of franchise.path?.length ? franchise.path : [franchise]) {
      let branch = level.get(part.id);
      if (!branch) {
        branch = { part, children: new Map() };
        level.set(part.id, branch);
      }
      level = branch.children;
    }
  }
  return [...roots.values()];
}

function PublishedBranch({ branch, className }: { branch: SeriesBranch; className: string }) {
  const children = [...branch.children.values()];
  return <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
    <Link href={`/archive?series=${encodeURIComponent(branch.part.code)}`} className={className}>{branch.part.title}</Link>
    {children.length ? <>
      <span aria-hidden="true">/</span>
      {children.map((child, index) => <Fragment key={child.part.id}>
        {index > 0 ? <span aria-hidden="true" className="mx-1.5">•</span> : null}
        {children.length > 1 && child.children.size > 0 ? <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
          <span aria-hidden="true">(</span><PublishedBranch branch={child} className={className}/><span aria-hidden="true">)</span>
        </span> : <PublishedBranch branch={child} className={className}/>}
      </Fragment>)}
    </> : null}
  </span>;
}

export function MediaItemFranchiseLinks({
  className,
  containerClassName,
  franchises,
  trailingAction,
}: MediaItemFranchiseLinksProps) {
  if (franchises.length === 0 && !trailingAction) {
    return null;
  }

  return (
    <div className={containerClassName}>
      {groupPublishedPaths(franchises).map(branch => <PublishedBranch key={branch.part.id} branch={branch} className={className}/>)}
      {franchises.filter(franchise => franchise.publicationStatus !== "published").map((franchise) => (
          <span key={franchise.id} className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-stone-500">
            {franchise.path?.map((part, index) => (
              <Fragment key={part.id}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                <span className={className}>{part.title}</span>
              </Fragment>
            )) ?? <span className={className}>{franchise.title}</span>}
            <span className="text-xs">(на проверке)</span>
          </span>
      ))}
      {trailingAction}
    </div>
  );
}
