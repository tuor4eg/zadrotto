import type { MediaItemGenre } from "@/lib/media/genres";
import Link from "next/link";
import { ArrowRight, FolderOpen, Shapes, Tag, X } from "lucide-react";

import type { ArchiveSeriesMatch } from "@/db/queries/franchises";
import { ArchiveChildSeries } from "@/app/archive/archive-child-series";
import { AdminEntityEditLink } from "@/components/archive/admin-entity-edit-link";
import { ArchiveSeriesMediaLinkSearch } from "@/app/archive/archive-series-media-link-search";
import type { MediaTypeOption } from "@/lib/media/types";

function SeriesPath({
  item,
  itemHref,
  parentHrefs,
}: {
  item: ArchiveSeriesMatch;
  itemHref?: string;
  parentHrefs?: Record<number, string>;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      {item.parents.map((parent) => (
        <span className="contents" key={parent.id}>
          {parentHrefs?.[parent.id] ? (
            <Link
              className="text-stone-500 underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
              href={parentHrefs[parent.id]}
            >
              {parent.title}
            </Link>
          ) : (
            <span className="text-stone-500">{parent.title}</span>
          )}
          <span aria-hidden="true" className="text-stone-400">/</span>
        </span>
      ))}
      {itemHref ? (
        <Link
          className="font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
          href={itemHref}
        >
          {item.title}
        </Link>
      ) : (
        <span className="font-semibold text-stone-900">{item.title}</span>
      )}
    </span>
  );
}

export function ArchiveSeriesMatches({
  items,
  moreHref,
  selectionHrefs,
  totalCount,
  genres = [],
  genreTotalCount = 0,
  genreMoreHref = "/genres",
  genreSelectionHrefs = {},
}: {
  items: ArchiveSeriesMatch[];
  moreHref: string;
  selectionHrefs: Record<number, string>;
  totalCount: number;
  genres?: readonly MediaItemGenre[];
  genreTotalCount?: number;
  genreMoreHref?: string;
  genreSelectionHrefs?: Record<number, string>;
}) {
  if (items.length === 0 && genres.length === 0) return null;

  return (
    <section className="archive-paper archive-panel grid gap-3 border-amber-300/70 bg-amber-100/75 px-4 py-3 text-sm shadow-md" aria-label={genres.length ? (items.length ? "Совпадения в сериях и жанрах" : "Совпадения в жанрах") : "Совпадения в сериях"}>
      {items.length ? <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex shrink-0 items-center gap-2 font-semibold text-stone-700">
        <FolderOpen className="size-5" />
        <span>Совпадения в сериях: {totalCount}</span>
      </div>
      <ul className="flex min-w-0 flex-1 flex-row flex-wrap gap-x-5 gap-y-1.5 max-sm:w-full max-sm:basis-full">
        {items.map((item) => (
          <li className="min-w-0" key={item.id}>
            <SeriesPath
              item={item}
              itemHref={selectionHrefs[item.id]}
              parentHrefs={selectionHrefs}
            />
          </li>
        ))}
      </ul>
      {totalCount > items.length ? (
        <Link className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-stone-300/80 bg-white/85 px-3 font-mono text-xs font-semibold text-stone-700 hover:border-stone-700 hover:text-stone-950" href={moreHref}>
          Посмотреть в сериях <ArrowRight className="size-4" />
        </Link>
      ) : null}
      </div> : null}
      {genres.length ? <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${items.length ? "border-t border-stone-300/50 pt-3" : ""}`}>
        <div className="flex shrink-0 items-center gap-2 font-semibold text-stone-700">
          <Shapes className="size-5" aria-hidden="true" /><span>Совпадения в жанрах: {genreTotalCount}</span>
        </div>
        <ul className="flex min-w-0 flex-1 flex-row flex-wrap gap-x-5 gap-y-1.5 max-sm:w-full max-sm:basis-full">
          {genres.map((genre) => <li key={genre.id} className="min-w-0">
            <Link href={genreSelectionHrefs[genre.id] ?? `/archive?genre=${encodeURIComponent(genre.slug)}`} className="break-words font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4 hover:text-stone-950">{genre.name}</Link>
          </li>)}
        </ul>
        {genreTotalCount > genres.length ? <Link href={genreMoreHref} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-stone-300/80 bg-white/85 px-3 font-mono text-xs font-semibold text-stone-700 hover:border-stone-700 hover:text-stone-950">
          Посмотреть в жанрах <ArrowRight className="size-4" />
        </Link> : null}
      </div> : null}
    </section>
  );
}

export function ArchiveSelectedSeries({
  adminCanEdit,
  authorCanAddMedia,
  childSeries,
  clearHref,
  item,
  parentHrefs,
  mediaTypes,
}: {
  adminCanEdit: boolean;
  authorCanAddMedia: boolean;
  childSeries: Array<{ id: number; href: string; title: string }>;
  clearHref: string;
  item: ArchiveSeriesMatch;
  parentHrefs: Record<number, string>;
  mediaTypes: MediaTypeOption[];
}) {
  return (
    <section
      className="archive-paper archive-panel relative z-[60] flex min-w-0 flex-wrap items-start gap-3 overflow-visible border-amber-300/70 bg-amber-100/75 px-4 py-2.5 text-sm shadow-md"
      style={{ overflow: "visible" }}
      aria-label="Выбранная серия"
    >
      <Tag className="mt-2 size-5 shrink-0 text-stone-500" />
      <div className={`min-w-0 flex-1 ${
        childSeries.length > 0 ? "sm:flex-none sm:max-w-[40%]" : ""
      } ${
        childSeries.length > 0 ? "pt-1" : "pt-2"
      }`}>
        <SeriesPath item={item} parentHrefs={parentHrefs} />
      </div>
      {childSeries.length > 0 ? (
        <div className="flex min-w-0 flex-1 items-baseline gap-x-2 max-sm:order-last max-sm:w-full max-sm:basis-full">
          <span aria-hidden="true" className="hidden text-stone-400 sm:inline">·</span>
          <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
            Серии внутри
          </span>
          <ArchiveChildSeries items={childSeries} />
        </div>
      ) : null}
      {authorCanAddMedia ? (
        <ArchiveSeriesMediaLinkSearch
          franchiseCode={item.code}
          mediaTypes={mediaTypes}
        />
      ) : null}
      {adminCanEdit ? (
        <AdminEntityEditLink
          ariaLabel={`Редактировать серию ${item.title}`}
          href={`/admin/series/${item.id}/edit`}
          tooltipLabel="Редактировать серию"
          tooltipSide="bottom"
        />
      ) : null}
      <Link className="grid size-9 shrink-0 place-items-center rounded-md text-stone-500 hover:bg-stone-200/70 hover:text-stone-950" href={clearHref} aria-label="Сбросить выбранную серию">
        <X className="size-4" />
      </Link>
    </section>
  );
}
