import Link from "next/link";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { AdminEntityEditLink } from "@/components/archive/admin-entity-edit-link";
import { formatMediaItemsCount } from "@/app/series/series-format";

type SeriesHeaderFranchise = {
  id: number;
  code: string;
  title: string;
  originalTitle: string | null;
  parents: Array<{ id: number; code: string; title: string }>;
};

function getParentBreadcrumbs(franchise: SeriesHeaderFranchise) {
  return franchise.parents.filter(
    (parent, index, parents) =>
      parent.id !== franchise.id
      && parent.code !== franchise.code
      && parents.findIndex(
        (candidate) => candidate.id === parent.id || candidate.code === parent.code,
      ) === index,
  );
}

export function SeriesPageHeader({
  adminCanEdit,
  children,
  franchise,
  mediaItemsCount,
  view = "series",
}: {
  adminCanEdit: boolean;
  children?: ReactNode;
  franchise: SeriesHeaderFranchise;
  mediaItemsCount: number;
  view?: "series" | "children";
}) {
  const parentBreadcrumbs = getParentBreadcrumbs(franchise);

  return (
    <div className="archive-franchise-sticker">
      <div className="flex min-w-0 items-start gap-3 font-mono text-xs">
        <p className="shrink-0 font-semibold uppercase leading-5 tracking-[0.18em] text-red-800">
          Серия
        </p>
        <nav aria-label="Хлебные крошки" className="min-w-0 flex-1 leading-5 text-stone-600">
          <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <li className="shrink-0">
              <Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href="/">
                Главная
              </Link>
            </li>
            <li aria-hidden="true" className="shrink-0 text-stone-400">/</li>
            <li className="shrink-0">
              <Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href="/archive">
                Архив
              </Link>
            </li>
            <li aria-hidden="true" className="shrink-0 text-stone-400">/</li>
            <li className="shrink-0">
              <Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href="/series">
                Все серии
              </Link>
            </li>
            {parentBreadcrumbs.map((parent) => (
              <Fragment key={parent.id}>
                <li aria-hidden="true" className="shrink-0 text-stone-400">/</li>
                <li className="min-w-0">
                  <Link
                    className="break-words underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
                    href={`/series/${parent.code}`}
                  >
                    {parent.title}
                  </Link>
                </li>
              </Fragment>
            ))}
            <li aria-hidden="true" className="shrink-0 text-stone-400">/</li>
            <li className="min-w-0 break-words text-stone-800" aria-current={view === "series" ? "page" : undefined}>
              {view === "children" ? (
                <Link
                  className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
                  href={`/series/${franchise.code}`}
                >
                  {franchise.title}
                </Link>
              ) : franchise.title}
            </li>
            {view === "children" ? (
              <>
                <li aria-hidden="true" className="shrink-0 text-stone-400">/</li>
                <li className="min-w-0 break-words text-stone-800" aria-current="page">
                  Серии внутри
                </li>
              </>
            ) : null}
          </ol>
        </nav>
        {adminCanEdit ? (
          <AdminEntityEditLink
            ariaLabel={`Редактировать серию ${franchise.title}`}
            href={`/admin/series/${franchise.id}/edit`}
            tooltipLabel="Редактировать серию"
            tooltipSide="bottom"
          />
        ) : null}
      </div>
      <div className="mt-3 flex flex-col gap-x-6 gap-y-3 lg:flex-row lg:items-baseline">
        <div className="min-w-0">
          <h1 className="break-words font-serif text-5xl leading-none text-stone-950 sm:text-6xl">
            {franchise.title}
          </h1>
          {franchise.originalTitle && franchise.originalTitle !== franchise.title ? (
            <p className="mt-2 break-words font-mono text-sm uppercase tracking-[0.16em] text-stone-600">
              {franchise.originalTitle}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-stone-500 lg:text-right">
          {formatMediaItemsCount(mediaItemsCount)}
        </p>
      </div>
      {children}
    </div>
  );
}
