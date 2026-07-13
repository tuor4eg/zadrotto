"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const currentSearchQuery = useRef(searchQuery);
  const draftRef = useRef(searchQuery);
  const hasUnconfirmedDraft = useRef(false);
  const onSearchRef = useRef(onSearch);
  const pendingQueries = useRef(new Set<string>());
  const previousSearchQuery = useRef(searchQuery);

  currentSearchQuery.current = searchQuery;
  onSearchRef.current = onSearch;

  useEffect(() => {
    if (previousSearchQuery.current === searchQuery) {
      return;
    }

    previousSearchQuery.current = searchQuery;

    if (searchQuery === draftRef.current) {
      pendingQueries.current.delete(searchQuery);
      hasUnconfirmedDraft.current = false;
      return;
    }

    if (pendingQueries.current.delete(searchQuery) || hasUnconfirmedDraft.current) {
      hasUnconfirmedDraft.current = true;
      pendingQueries.current.add(draftRef.current);
      onSearchRef.current(draftRef.current);
      return;
    }

    draftRef.current = searchQuery;
    setDraft(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (draft === currentSearchQuery.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      pendingQueries.current.add(draft);
      onSearchRef.current(draft);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [delay, draft]);

  const updateDraft = useCallback((nextDraft: string) => {
    draftRef.current = nextDraft;
    hasUnconfirmedDraft.current = nextDraft !== currentSearchQuery.current;
    setDraft(nextDraft);
  }, []);

  const resetDraft = useCallback((nextDraft = "") => {
    updateDraft(nextDraft);
  }, [updateDraft]);

  return { draft, resetDraft, setDraft: updateDraft };
}
