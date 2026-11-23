import type { MediaItemPlatform } from "@/lib/media/platforms";
import type { MediaItemGenre } from "@/lib/media/genres";
import Link from "next/link";
import { ArrowRight, FolderOpen, Shapes, Tag, Users, X, type LucideIcon } from "lucide-react";

import type { ArchiveSeriesMatch } from "@/db/queries/franchises";
import { ArchiveChildSeries } from "@/app/archive/archive-child-series";
import { AdminEntityEditLink } from "@/components/archive/admin-entity-edit-link";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { ArchiveSeriesMediaLinkSearch } from "@/app/archive/archive-series-media-link-search";
import { ArchiveMatchList } from "./archive-match-list";
import { ArchiveSeriesDescendantsToggle } from "./archive-series-descendants-toggle";
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

function ArchiveMatchCategoryLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <ArchiveTooltip className="ml-auto shrink-0" label={label} side="bottom" align="end" portal>
      <Link
        href={href}
        aria-label={label}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300/80 bg-white/85 px-3 text-stone-700 hover:border-stone-700 hover:text-stone-950"
      >
        <Icon className="size-5" aria-hidden="true" />
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </ArchiveTooltip>
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
  tags = [],
  tagSelectionHrefs = {},
  tagMoreHref = "/tags",
  platforms = [],
  platformTotalCount = 0,
  platformMoreHref = "/platforms",
  platformSelectionHrefs = {},
  creators = [],
  creatorTotalCount = 0,
  creatorMoreHref = "/creators",
  creatorSelectionHrefs = {},
}: {
  items: ArchiveSeriesMatch[];
  moreHref: string;
  selectionHrefs: Record<number, string>;
  totalCount: number;
  tags?: readonly { id: number; code: string; title: string }[];
  tagSelectionHrefs?: Record<number, string>;
  tagMoreHref?: string;
  genres?: readonly MediaItemGenre[];
  genreTotalCount?: number;
  genreMoreHref?: string;
  genreSelectionHrefs?: Record<number, string>;
  platforms?: readonly MediaItemPlatform[];
  platformTotalCount?: number;
  platformMoreHref?: string;
  platformSelectionHrefs?: Record<number, string>;
  creators?: readonly { id: number; name: string; slug: string }[];
  creatorTotalCount?: number;
  creatorMoreHref?: string;
  creatorSelectionHrefs?: Record<number, string>;
}) {
  if (items.length === 0 && genres.length === 0 && creators.length === 0 && platforms.length === 0 && tags.length === 0) return null;

  return (
    <section className="archive-paper archive-panel grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-amber-300/70 bg-amber-100/75 px-4 py-3 text-sm shadow-md" aria-label="Совпадения по поиску">
      {items.length ? <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className="flex shrink-0 items-center gap-2 font-semibold text-stone-700">
        <FolderOpen className="size-5" />
        <span>Совпадения в сериях: {totalCount}</span>
      </div>
      <ArchiveMatchList>
        {items.map((item) => (
          <li className="min-w-0" key={item.id}>
            <SeriesPath
              item={item}
              itemHref={selectionHrefs[item.id]}
              parentHrefs={selectionHrefs}
            />
          </li>
        ))}
      </ArchiveMatchList>
        <ArchiveMatchCategoryLink href={moreHref} label="Посмотреть в сериях" icon={FolderOpen} />
      </div> : null}
      {genres.length ? <div className={`flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] ${items.length ? "border-t border-stone-300/50 pt-3" : ""}`}>
        <div className="flex shrink-0 items-center gap-2 font-semibold text-stone-700">
          <Shapes className="size-5" aria-hidden="true" /><span>Совпадения в жанрах: {genreTotalCount}</span>
        </div>
        <ArchiveMatchList>
          {genres.map((genre) => <li key={genre.id} className="min-w-0">
            <Link href={genreSelectionHrefs[genre.id] ?? `/archive?genre=${encodeURIComponent(genre.slug)}`} className="break-words font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4 hover:text-stone-950">{genre.name}</Link>
          </li>)}
        </ArchiveMatchList>
        <Link href={genreMoreHref} className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-stone-300/80 bg-white/85 px-3 font-mono text-xs font-semibold text-stone-700 hover:border-stone-700 hover:text-stone-950">
          Посмотреть в жанрах <ArrowRight className="size-4" />
        </Link>
      </div> : null}
      {platforms.length ? <div className={`flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] ${items.length || genres.length ? "border-t border-stone-300/50 pt-3" : ""}`}>
        <div className="flex shrink-0 items-center gap-2 font-semibold text-stone-700">
          <Shapes className="size-5" aria-hidden="true" /><span>Совпадения в платформах: {platformTotalCount}</span>
        </div>
        <ArchiveMatchList>
          {platforms.map((platform) => <li key={platform.id} className="min-w-0">
            <Link href={platformSelectionHrefs[platform.id] ?? `/archive?platform=${encodeURIComponent(platform.slug)}`} className="break-words font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4 hover:text-stone-950">{platform.name}</Link>
          </li>)}
        </ArchiveMatchList>
        <Link href={platformMoreHref} className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-stone-300/80 bg-white/85 px-3 font-mono text-xs font-semibold text-stone-700 hover:border-stone-700 hover:text-stone-950">
          Посмотреть в платформах <ArrowRight className="size-4" />
        </Link>
      </div> : null}
      {creators.length ? <div className={`flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] ${items.length || genres.length ? "border-t border-stone-300/50 pt-3" : ""}`}>
        <div className="flex shrink-0 items-center gap-2 font-semibold text-stone-700">
          <Users className="size-5" aria-hidden="true" /><span>Совпадения в создателях: {creatorTotalCount}</span>
        </div>
        <ArchiveMatchList>
          {creators.map((creator) => <li key={creator.id} className="min-w-0">
            <Link href={creatorSelectionHrefs[creator.id] ?? `/archive?creator=${encodeURIComponent(creator.slug)}`} className="break-words font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4 hover:text-stone-950">{creator.name}</Link>
          </li>)}
        </ArchiveMatchList>
        <ArchiveMatchCategoryLink href={creatorMoreHref} label="Посмотреть в создателях" icon={Users} />
      </div> : null}
      {tags.length ? <div className={`flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] ${items.length || genres.length || platforms.length || creators.length ? "border-t border-stone-300/50 pt-3" : ""}`}>
        <div className="flex shrink-0 items-center gap-2 font-semibold text-stone-700">
          <Tag className="size-5" aria-hidden="true" /><span>Совпадения в тегах: {tags.length}</span>
        </div>
        <ArchiveMatchList>
          {tags.map(tag => <li key={tag.id} className="min-w-0">
            <Link href={tagSelectionHrefs[tag.id] ?? `/archive?tag=${encodeURIComponent(tag.code)}`} className="break-words font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4 hover:text-stone-950">{tag.title}</Link>
          </li>)}
        </ArchiveMatchList>
        <ArchiveMatchCategoryLink href={tagMoreHref} label="Посмотреть в тегах" icon={Tag} />
      </div> : null}
    </section>
  );
}

export function ArchiveSelectedSeries({
  adminCanEdit,
  authorCanAddMedia,
  authorCanEdit = false,
  childSeries,
  clearHref,
  includeDescendants,
  toggleDescendantsHref,
  item,
  parentHrefs,
  mediaTypes,
}: {
  adminCanEdit: boolean;
  authorCanAddMedia: boolean;
  authorCanEdit?: boolean;
  childSeries: Array<{ id: number; href: string; title: string }>;
  clearHref: string;
  includeDescendants: boolean;
  toggleDescendantsHref: string;
  item: ArchiveSeriesMatch;
  parentHrefs: Record<number, string>;
  mediaTypes: MediaTypeOption[];
}) {
  return (
    <section
      className="archive-paper archive-panel relative z-[60] flex min-w-0 flex-wrap items-baseline gap-3 overflow-visible border-amber-300/70 bg-amber-100/75 px-4 py-2.5 text-sm shadow-md"
      style={{ overflow: "visible" }}
      aria-label="Выбранная серия"
    >
      <Tag className="size-5 shrink-0 self-center text-stone-500" />
      <div className={`min-w-0 flex-1 ${
        childSeries.length > 0 ? "sm:flex-none sm:max-w-[40%]" : ""
      }`}>
        <SeriesPath item={item} parentHrefs={parentHrefs} />
      </div>
      {childSeries.length > 0 ? (
        <div className="flex min-w-0 flex-1 items-baseline gap-x-2 max-sm:order-last max-sm:w-full max-sm:basis-full">
          <span aria-hidden="true" className="hidden text-stone-400 sm:inline">·</span>
          <ArchiveSeriesDescendantsToggle checked={includeDescendants} href={toggleDescendantsHref} />
          <ArchiveChildSeries items={childSeries} />
        </div>
      ) : null}
      {authorCanAddMedia ? (
        <ArchiveSeriesMediaLinkSearch
          franchiseCode={item.code}
          mediaTypes={mediaTypes}
        />
      ) : null}
      {authorCanEdit && !adminCanEdit ? <Link className="text-xs underline" href={`/author/series/${item.id}/edit`}>Редактировать</Link> : null}
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
