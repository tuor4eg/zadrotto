import Link from "next/link";
import { Fragment } from "react";

import type { MediaItemFranchiseLink } from "@/db/queries/media-items";

type MediaItemFranchiseLinksProps = {
  className: string;
  containerClassName: string;
  franchises: MediaItemFranchiseLink[];
  trailingAction?: React.ReactNode;
};

export function MediaItemFranchiseLinks({
  className,
  containerClassName,
  franchises,
  trailingAction,
}: MediaItemFranchiseLinksProps) {
  if (franchises.length === 0 && !trailingAction) {
    return <>—</>;
  }

  return (
    <div className={containerClassName}>
      {franchises.map((franchise) => (
        franchise.publicationStatus === "published" ? (
          <span key={franchise.id} className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
            {(franchise.path ?? [franchise]).map((part, index) => (
              <Fragment key={part.id}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                <Link href={`/series/${part.code}`} className={className}>
                  {part.title}
                </Link>
              </Fragment>
            ))}
          </span>
        ) : (
          <span key={franchise.id} className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-stone-500">
            {franchise.path?.map((part, index) => (
              <Fragment key={part.id}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                <span className={className}>{part.title}</span>
              </Fragment>
            )) ?? <span className={className}>{franchise.title}</span>}
            <span className="text-xs">(на проверке)</span>
          </span>
        )
      ))}
      {trailingAction}
    </div>
  );
}
