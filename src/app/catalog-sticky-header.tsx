"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Shield, UserCircle } from "lucide-react";

import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import type {
  AuthorRatingFilter,
  CatalogSort,
  CatalogSortDirection,
  CatalogYearFilter,
  CatalogYearMode,
  MediaTypeFilter,
} from "./media-items-catalog-logic";
import { CatalogHeaderControls } from "./catalog-header-controls";

type CatalogStickyHeaderProps = {
  authorRatingFilter: AuthorRatingFilter;
  currentAdminUser: boolean;
  currentAuthor: boolean;
  mediaTypeFilter: MediaTypeFilter;
  minReleaseYear: number | null;
  searchQuery: string;
  sort: CatalogSort;
  sortDirection: CatalogSortDirection;
  yearFilter: CatalogYearFilter;
  yearMode: CatalogYearMode;
};

export function CatalogStickyHeader({
  authorRatingFilter,
  currentAdminUser,
  currentAuthor,
  mediaTypeFilter,
  minReleaseYear,
  searchQuery,
  sort,
  sortDirection,
  yearFilter,
  yearMode,
}: CatalogStickyHeaderProps) {
  const router = useRouter();
  const [isCompact, setIsCompact] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const isCompactRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const authorLinkLabel = currentAuthor ? "Профиль" : "Войти";

  useEffect(() => {
    const compactScrollY = 72;
    const expandedScrollY = 12;
    const largeViewportQuery = window.matchMedia("(min-width: 1024px)");

    function updateCompactState() {
      if (!largeViewportQuery.matches) {
        if (isCompactRef.current) {
          isCompactRef.current = false;
          setIsCompact(false);
        }

        return;
      }

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
      className={`archive-control-surface inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-stone-300/80 font-mono text-xs uppercase tracking-[0.12em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-[border-color,background-color,width,padding] hover:border-stone-700 hover:bg-stone-50 ${
        isCompact ? "w-9 px-0" : "w-9 px-0 lg:w-auto lg:gap-2 lg:px-3"
      }`}
    >
      <Shield className="size-4" />
      <span className={isCompact ? "sr-only" : "sr-only lg:not-sr-only"}>Админка</span>
    </Link>
  ) : null;
  const authorLink = currentAuthor ? (
    <Link
      href="/author"
      aria-label={authorLinkLabel}
      className={`archive-control-surface inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-stone-300/80 font-mono text-xs uppercase tracking-[0.12em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-[border-color,background-color,width,padding] hover:border-stone-700 hover:bg-stone-50 ${
        isCompact ? "w-9 px-0" : "w-9 px-0 lg:w-auto lg:gap-2 lg:px-3"
      }`}
    >
      <UserCircle className="size-5" />
      <span className={isCompact ? "sr-only" : "sr-only lg:not-sr-only"}>{authorLinkLabel}</span>
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => setIsLoginOpen(true)}
      aria-label={authorLinkLabel}
      className={`archive-control-surface inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-stone-300/80 font-mono text-xs uppercase tracking-[0.12em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-[border-color,background-color,width,padding] hover:border-stone-700 hover:bg-stone-50 ${
        isCompact ? "w-9 px-0" : "w-9 px-0 lg:w-auto lg:gap-2 lg:px-3"
      }`}
    >
      <UserCircle className="size-5" />
      <span className={isCompact ? "sr-only" : "sr-only lg:not-sr-only"}>{authorLinkLabel}</span>
    </button>
  );

  return (
    <>
    <header
      className={`archive-paper archive-panel archive-stack archive-stack-bottom archive-sticky-header flex items-center gap-4 lg:transition-[max-width,padding,width] lg:duration-200 ${
        isCompact
          ? "mx-auto -mt-2 w-full max-w-none flex-wrap justify-center px-2 py-2 lg:ml-auto lg:mr-0 lg:mt-0 lg:max-w-[320px] lg:flex-nowrap lg:justify-end lg:pb-2 lg:pt-4"
          : "mx-auto -mt-2 w-full max-w-none flex-wrap justify-center px-2 py-2 lg:ml-auto lg:mt-0 lg:justify-between lg:py-4 lg:pl-5 lg:pr-4"
      }`}
    >
      <div
        className={`min-w-0 items-center gap-4 overflow-hidden lg:transition-[max-width,opacity,transform] lg:duration-200 ${
          isCompact
            ? "hidden"
            : "hidden lg:flex lg:max-w-[720px] lg:translate-x-0 lg:opacity-100"
        }`}
        aria-hidden={isCompact ? true : undefined}
      >
        <div className="grid size-16 shrink-0 place-items-center">
          <Image
            src="/site-logo.png"
            alt="Журнал, которого не было"
            width={64}
            height={64}
            className="size-16 object-contain"
            priority
          />
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
        className={`grid w-full min-w-0 items-center gap-2 text-sm ${
          currentAdminUser
            ? "grid-cols-[minmax(0,1fr)_2.25rem_2.25rem]"
            : "grid-cols-[minmax(0,1fr)_2.25rem]"
        } ${
          isCompact
            ? "lg:flex lg:flex-nowrap lg:justify-end"
            : "lg:flex lg:w-auto lg:shrink-0 lg:flex-wrap lg:items-center lg:justify-end"
        }`}
      >
        <CatalogHeaderControls
          authorRatingFilter={authorRatingFilter}
          compact={isCompact}
          currentAuthor={currentAuthor}
          mediaTypeFilter={mediaTypeFilter}
          minReleaseYear={minReleaseYear}
          searchQuery={searchQuery}
          sort={sort}
          sortDirection={sortDirection}
          yearFilter={yearFilter}
          yearMode={yearMode}
        />
        {adminLink && isCompact ? (
          <ArchiveTooltip className="min-w-0" label="Админка" side="bottom">
            {adminLink}
          </ArchiveTooltip>
        ) : (
          adminLink
        )}
        {isCompact ? (
          <ArchiveTooltip className="min-w-0" label={authorLinkLabel} side="bottom">
            {authorLink}
          </ArchiveTooltip>
        ) : (
          authorLink
        )}
      </div>
    </header>
    {isLoginOpen
      ? createPortal(
          <AuthorLoginModal
            onClose={() => setIsLoginOpen(false)}
            onSuccess={() => {
              setIsLoginOpen(false);
              router.refresh();
            }}
          />,
          document.body,
        )
      : null}
    </>
  );
}
