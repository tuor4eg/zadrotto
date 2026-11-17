"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

type UseDebouncedSearchDraftOptions = {
  delay?: number;
  onSearch: (query: string) => void;
  searchQuery: string;
};

export function useDebouncedSearchDraft({
  delay = 250,
  onSearch,
  searchQuery,
}: UseDebouncedSearchDraftOptions) {
  const [draft, setDraft] = useState(searchQuery);
  const draftRef = useRef(searchQuery);
  const pendingQueries = useRef(new Set<string>());
  const previousSearchQuery = useRef(searchQuery);
  const dispatchSearch = useEffectEvent(onSearch);

  useEffect(() => {
    if (previousSearchQuery.current === searchQuery) {
      return;
    }

    previousSearchQuery.current = searchQuery;

    if (searchQuery === draftRef.current) {
      pendingQueries.current.clear();
      return;
    }

    if (pendingQueries.current.delete(searchQuery)) {
      pendingQueries.current.add(draftRef.current);
      dispatchSearch(draftRef.current);
      return;
    }

    // A query we did not dispatch comes from navigation, not a stale search response.
    pendingQueries.current.clear();
    draftRef.current = searchQuery;
    setDraft(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (draft === searchQuery) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (draftRef.current !== draft) {
        return;
      }
      pendingQueries.current.add(draft);
      dispatchSearch(draft);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [delay, draft, searchQuery]);

  const updateDraft = useCallback((nextDraft: string) => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, []);

  const resetDraft = useCallback((nextDraft = "") => {
    updateDraft(nextDraft);
  }, [updateDraft]);

  return { draft, resetDraft, setDraft: updateDraft };
}
