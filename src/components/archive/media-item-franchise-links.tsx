import Link from "next/link";
import { Fragment } from "react";

import type { MediaItemFranchiseLink } from "@/db/queries/media-items";

type MediaItemFranchiseLinksProps = {
  className: string;
  containerClassName: string;
  franchises: MediaItemFranchiseLink[];
};

export function MediaItemFranchiseLinks({
  className,
  containerClassName,
  franchises,
}: MediaItemFranchiseLinksProps) {
  if (franchises.length === 0) {
    return <>—</>;
  }

  return (
    <div className={containerClassName}>
      {franchises.map((franchise) => (
        franchise.publicationStatus === "published" ? (
          <span key={franchise.id} className="inline-flex flex-wrap items-center gap-x-1.5">
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
          <span key={franchise.id} className={`${className} text-stone-500`}>
            {franchise.path?.map((part, index) => (
              <Fragment key={part.id}>
                {index > 0 ? " / " : null}
                {part.title}
              </Fragment>
            )) ?? franchise.title} <span className="text-xs">(на проверке)</span>
          </span>
        )
      ))}
    </div>
  );
}
