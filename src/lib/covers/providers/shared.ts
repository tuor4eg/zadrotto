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

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly providerMessage: string | null,
  ) {
    super(`Provider search failed with HTTP ${status}.`);
    this.name = "ProviderHttpError";
  }
}

function getProviderErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const payload = value as {
    error?: unknown;
    errors?: unknown;
    message?: unknown;
  };
  const nestedError = payload.error && typeof payload.error === "object"
    ? (payload.error as { message?: unknown }).message
    : payload.error;
  const firstError = Array.isArray(payload.errors) ? payload.errors[0] : null;
  const candidates = [
    payload.message,
    nestedError,
    firstError && typeof firstError === "object"
      ? (firstError as { message?: unknown }).message
      : firstError,
  ];
  const message = candidates.find((candidate): candidate is string =>
    typeof candidate === "string" && Boolean(candidate.trim()));

  return message ? message.trim().replace(/\s+/g, " ").slice(0, 500) : null;
}

export async function fetchSearchJson<T>(url: URL, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as unknown;
    throw new ProviderHttpError(response.status, getProviderErrorMessage(payload));
  }

  return (await response.json()) as T;
}
