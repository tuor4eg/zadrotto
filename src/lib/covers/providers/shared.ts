import type { CoverSearchInput, TitleSearchInput } from "@/lib/covers/types";

export function normalizeSearchQuery(input: CoverSearchInput | TitleSearchInput) {
  if ("query" in input) {
    return input.query.trim();
  }

  return (input.originalTitle || input.title).trim();
}

export function getFirstYear(value: string | null | undefined) {
  const match = value?.match(/^(\d{4})/);

  return match ? Number(match[1]) : undefined;
}

export function buildUrl(baseUrl: string, params: Record<string, string | number | boolean | null>) {
  const url = new URL(baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
}

export async function fetchJson<T>(url: URL, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}
