"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Shield, UserCircle } from "lucide-react";

import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import type {
  AuthorRatingFilter,
  CatalogSort,
  MediaTypeFilter,
} from "./media-items-catalog-logic";
import { CatalogHeaderControls } from "./catalog-header-controls";

type CatalogStickyHeaderProps = {
  authorRatingFilter: AuthorRatingFilter;
  currentAdminUser: boolean;
  currentAuthor: boolean;
  mediaTypeFilter: MediaTypeFilter;
  searchQuery: string;
  sort: CatalogSort;
};

export function CatalogStickyHeader({
  authorRatingFilter,
  currentAdminUser,
  currentAuthor,
  mediaTypeFilter,
  searchQuery,
  sort,
}: CatalogStickyHeaderProps) {
  const [isCompact, setIsCompact] = useState(false);
  const isCompactRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const authorLinkLabel = currentAuthor ? "Профиль" : "Войти";

  useEffect(() => {
    const compactScrollY = 72;
    const expandedScrollY = 12;

    function updateCompactState() {
      const shouldBeCompact = isCompactRef.current
        ? window.scrollY > expandedScrollY
        : window.scrollY > compactScrollY;

      if (shouldBeCompact === isCompactRef.current) {
        return;
      }

      isCompactRef.current = shouldBeCompact;
      setIsCompact(shouldBeCompact);
    }

    function scheduleUpdateCompactState() {
      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updateCompactState();
      });
    }

    updateCompactState();
    window.addEventListener("scroll", scheduleUpdateCompactState, { passive: true });
    window.addEventListener("resize", scheduleUpdateCompactState);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }

      window.removeEventListener("scroll", scheduleUpdateCompactState);
      window.removeEventListener("resize", scheduleUpdateCompactState);
    };
  }, []);

  const adminLink = currentAdminUser ? (
    <Link
      href="/admin"
      aria-label="Админка"
      className={`inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-stone-300/80 bg-stone-50/80 font-mono text-xs uppercase tracking-[0.12em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-[border-color,background-color,width,padding] hover:border-stone-700 hover:bg-stone-50 ${
        isCompact ? "w-9 px-0" : "gap-2 px-3"
      }`}
    >
      <Shield className="size-4" />
      <span className={isCompact ? "sr-only" : undefined}>Админка</span>
    </Link>
  ) : null;
  const authorLink = (
    <Link
      href={currentAuthor ? "/author" : "/author/login"}
      aria-label={authorLinkLabel}
      className={`inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-stone-300/80 bg-stone-50/80 font-mono text-xs uppercase tracking-[0.12em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-[border-color,background-color,width,padding] hover:border-stone-700 hover:bg-stone-50 ${
        isCompact ? "w-9 px-0" : "gap-2 px-3"
      }`}
    >
      <UserCircle className="size-5" />
      <span className={isCompact ? "sr-only" : undefined}>{authorLinkLabel}</span>
    </Link>
  );

  return (
    <header
      className={`archive-paper archive-panel archive-stack archive-stack-bottom archive-sticky-header flex items-center gap-4 transition-[max-width,padding,width] duration-200 ${
        isCompact
          ? "ml-auto w-full max-w-[320px] flex-wrap justify-end px-2 pb-2 pt-4 lg:flex-nowrap"
          : "w-full flex-wrap justify-between py-4 pl-5 pr-4"
      }`}
    >
      <div
        className={`min-w-0 items-center gap-4 overflow-hidden transition-[max-width,opacity,transform] duration-200 ${
          isCompact
            ? "hidden"
            : "flex max-w-[720px] translate-x-0 opacity-100"
        }`}
        aria-hidden={isCompact}
      >
        <div className="grid size-16 shrink-0 place-items-center border border-stone-400/70 bg-stone-100/60 text-center font-mono text-sm font-semibold leading-5 text-stone-950 shadow-[inset_0_0_0_1px_rgba(68,64,60,0.16)]">
          Ж. К.
          <br />
          Н. Б.
        </div>
        <div className="min-w-0">
          <h1 className="pt-5 font-serif text-3xl leading-none text-stone-950 sm:text-5xl">
            Журнал, которого не было
          </h1>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-stone-700">
            База хранит факты. Журнал достает из них память.
          </p>
        </div>
      </div>

      <div
        className={`flex items-center gap-2 text-sm ${
          isCompact
            ? "w-full min-w-0 flex-nowrap justify-end"
            : "w-full flex-wrap justify-start sm:items-start lg:w-auto lg:shrink-0 lg:items-center lg:justify-end"
        }`}
      >
        <CatalogHeaderControls
          authorRatingFilter={authorRatingFilter}
          compact={isCompact}
          currentAuthor={currentAuthor}
          mediaTypeFilter={mediaTypeFilter}
          searchQuery={searchQuery}
          sort={sort}
        />
        {adminLink && isCompact ? (
          <ArchiveTooltip label="Админка" side="bottom">
            {adminLink}
          </ArchiveTooltip>
        ) : (
          adminLink
        )}
        {isCompact ? (
          <ArchiveTooltip label={authorLinkLabel} side="bottom">
            {authorLink}
          </ArchiveTooltip>
        ) : (
          authorLink
        )}
      </div>
    </header>
  );
}
