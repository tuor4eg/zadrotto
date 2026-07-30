"use client";

import type { SuggestFranchisesMediaInput } from "./suggest-franchises";

export type FranchiseSuggestionOption = {
  id: number;
  title: string;
};

export async function requestFranchiseSuggestions(input: SuggestFranchisesMediaInput) {
  const response = await fetch("/api/media/suggest-franchises", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as {
    franchiseIds?: number[];
    message?: string;
  };
  if (!response.ok) {
    throw new Error(body.message || "Не удалось подобрать серии.");
  }
  return body.franchiseIds ?? [];
}

export function resolveSuggestedFranchises<T extends FranchiseSuggestionOption>(
  options: readonly T[],
  selectedIds: readonly string[],
  suggestedIds: readonly number[],
) {
  const suggestedIdSet = new Set(suggestedIds.map(String));
  const selectedIdSet = new Set(selectedIds);
  return options.filter((option) =>
    suggestedIdSet.has(String(option.id)) && !selectedIdSet.has(String(option.id)));
}

export function appendUniqueFranchiseIds(current: readonly string[], ids: readonly number[]) {
  const result = [...current];
  const currentIds = new Set(current);
  for (const id of ids.map(String)) {
    if (!currentIds.has(id)) {
      result.push(id);
      currentIds.add(id);
    }
  }
  return result;
}
