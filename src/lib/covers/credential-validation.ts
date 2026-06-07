import {
  parseCoverProviderCredentials,
} from "@/lib/covers/credential-definitions";
import { buildUrl } from "@/lib/covers/providers/shared";
import type { CoverProviderCode } from "@/lib/covers/types";

type ValidationOk = {
  ok: true;
};

export type CoverProviderCredentialValidationResult =
  | ValidationOk
  | {
      ok: false;
      error:
        | "empty-credentials"
        | "invalid-credentials"
        | "provider-unavailable"
        | "unsupported-provider";
    };

type ValidationFetchResult =
  | {
      ok: true;
      response: Response;
    }
  | {
      ok: false;
      error: "provider-unavailable";
    };

const CREDENTIAL_VALIDATION_TIMEOUT_MS = 8_000;

async function fetchWithValidationTimeout(
  input: string | URL,
  init?: RequestInit,
): Promise<ValidationFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CREDENTIAL_VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });

    return { ok: true, response };
  } catch {
    return { ok: false, error: "provider-unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

function getCredentialsValidationError(response: Response) {
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return "invalid-credentials" as const;
  }

  return "provider-unavailable" as const;
}

async function validateTmdbCredentials(credentials: Record<string, string>) {
  const response = await fetchWithValidationTimeout(
    "https://api.themoviedb.org/3/authentication",
    {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    },
  );

  if (!response.ok) {
    return response;
  }

  return response.response.ok
    ? ({ ok: true } as const)
    : ({ ok: false, error: getCredentialsValidationError(response.response) } as const);
}

async function validateGoogleBooksCredentials(credentials: Record<string, string>) {
  const url = buildUrl("https://www.googleapis.com/books/v1/volumes", {
    q: "test",
    maxResults: 1,
    projection: "lite",
    key: credentials.apiKey,
  });
  const response = await fetchWithValidationTimeout(url);

  if (!response.ok) {
    return response;
  }

  return response.response.ok
    ? ({ ok: true } as const)
    : ({ ok: false, error: getCredentialsValidationError(response.response) } as const);
}

async function validateRawgCredentials(credentials: Record<string, string>) {
  const url = buildUrl("https://api.rawg.io/api/games", {
    key: credentials.apiKey,
    page_size: 1,
  });
  const response = await fetchWithValidationTimeout(url);

  if (!response.ok) {
    return response;
  }

  return response.response.ok
    ? ({ ok: true } as const)
    : ({ ok: false, error: getCredentialsValidationError(response.response) } as const);
}

async function validateIgdbCredentials(credentials: Record<string, string>) {
  const tokenUrl = buildUrl("https://id.twitch.tv/oauth2/token", {
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: "client_credentials",
  });
  const tokenResponse = await fetchWithValidationTimeout(tokenUrl, { method: "POST" });

  if (!tokenResponse.ok) {
    return tokenResponse;
  }

  if (!tokenResponse.response.ok) {
    return { ok: false as const, error: getCredentialsValidationError(tokenResponse.response) };
  }

  const token = (await tokenResponse.response.json()) as { access_token?: string };

  if (!token.access_token) {
    return { ok: false as const, error: "invalid-credentials" as const };
  }

  const igdbResponse = await fetchWithValidationTimeout("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      accept: "application/json",
      "Client-ID": credentials.clientId,
      Authorization: `Bearer ${token.access_token}`,
    },
    body: "fields id; limit 1;",
  });

  if (!igdbResponse.ok) {
    return igdbResponse;
  }

  return igdbResponse.response.ok
    ? ({ ok: true } as const)
    : ({ ok: false, error: getCredentialsValidationError(igdbResponse.response) } as const);
}

export async function validateCoverProviderCredentials(input: {
  providerCode: CoverProviderCode;
  values: Record<string, string>;
}): Promise<CoverProviderCredentialValidationResult> {
  const parsed = parseCoverProviderCredentials(input);

  if (!parsed.ok) {
    return parsed;
  }

  switch (input.providerCode) {
    case "tmdb":
      return validateTmdbCredentials(parsed.value);
    case "google-books":
      return validateGoogleBooksCredentials(parsed.value);
    case "igdb":
      return validateIgdbCredentials(parsed.value);
    case "rawg":
      return validateRawgCredentials(parsed.value);
    default:
      return { ok: false, error: "unsupported-provider" };
  }
}
