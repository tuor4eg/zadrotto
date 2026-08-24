"use client";

import { useEffect, useRef, useState } from "react";

import { ArchiveSiteHeader } from "@/components/archive/archive-site-header";
import type { ActiveQuiz, QuizHistoryEntry } from "@/lib/quizzes/model";
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
  incomingFriendRequestCount: number;
  submittedRequestCount: number;
  activeQuiz: ActiveQuiz | null;
  previousQuiz: QuizHistoryEntry | null;
  unavailableQuizMediaTypeNames: string[];
  isActiveQuizCompleted: boolean;
  isActiveQuizParticipant: boolean;
  mediaTypeFilter: MediaTypeFilter;
  minReleaseYear: number | null;
  searchQuery: string;
  sort: CatalogSort;
  sortDirection: CatalogSortDirection;
  yearFilter: CatalogYearFilter;
  yearMode: CatalogYearMode;
};

export function CatalogStickyHeader({
  activeQuiz,
  previousQuiz,
  unavailableQuizMediaTypeNames,
  authorRatingFilter,
  currentAdminUser,
  currentAuthor,
  incomingFriendRequestCount,
  submittedRequestCount,
  isActiveQuizCompleted,
  isActiveQuizParticipant,
  mediaTypeFilter,
  minReleaseYear,
  searchQuery,
  sort,
  sortDirection,
  yearFilter,
  yearMode,
}: CatalogStickyHeaderProps) {
  const [isCompact, setIsCompact] = useState(false);
  const isCompactRef = useRef(false);
  const frameRef = useRef<number | null>(null);

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

  return (
    <ArchiveSiteHeader
        brandHref="/"
        compact={isCompact}
        controls={
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
        }
        currentAdminUser={currentAdminUser}
        currentAuthor={currentAuthor}
        incomingFriendRequestCount={incomingFriendRequestCount}
        submittedRequestCount={submittedRequestCount}
        quiz={activeQuiz ? {
          active: activeQuiz,
          history: previousQuiz,
          isCompleted: isActiveQuizCompleted,
          isParticipating: isActiveQuizParticipant,
          unavailableMediaTypeNames: unavailableQuizMediaTypeNames,
        } : null}
        sticky
        variant="catalog"
    />
  );
}
