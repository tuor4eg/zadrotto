import type { CoverProviderCode } from "@/lib/covers/types";

export type CoverProviderCredentialField = {
  name: string;
  label: string;
  placeholder?: string;
};

export type CoverProviderCredentialDefinition = {
  providerCode: CoverProviderCode;
  fields: readonly CoverProviderCredentialField[];
};

export const COVER_PROVIDER_CREDENTIAL_DEFINITIONS = [
  {
    providerCode: "tmdb",
    fields: [
      {
        name: "accessToken",
        label: "API Read Access Token",
        placeholder: "eyJhbGciOiJIUzI1NiJ9...",
      },
    ],
  },
  {
    providerCode: "google-books",
    fields: [
      {
        name: "apiKey",
        label: "API key",
        placeholder: "AIza...",
      },
    ],
  },
  {
    providerCode: "igdb",
    fields: [
      {
        name: "clientId",
        label: "Twitch Client ID",
      },
      {
        name: "clientSecret",
        label: "Twitch Client Secret",
      },
    ],
  },
  {
    providerCode: "rawg",
    fields: [
      {
        name: "apiKey",
        label: "API key",
      },
    ],
  },
] as const satisfies readonly CoverProviderCredentialDefinition[];

export function getCoverProviderCredentialDefinition(providerCode: CoverProviderCode) {
  return COVER_PROVIDER_CREDENTIAL_DEFINITIONS.find(
    (definition) => definition.providerCode === providerCode,
  ) ?? null;
}

export function coverProviderRequiresCredentials(providerCode: CoverProviderCode) {
  return Boolean(getCoverProviderCredentialDefinition(providerCode));
}

export function parseCoverProviderCredentials(input: {
  providerCode: CoverProviderCode;
  values: Record<string, string>;
}) {
  const definition = getCoverProviderCredentialDefinition(input.providerCode);

  if (!definition) {
    return { ok: false as const, error: "unsupported-provider" as const };
  }

  const credentials: Record<string, string> = {};

  for (const field of definition.fields) {
    const value = input.values[field.name]?.trim() ?? "";

    if (!value) {
      return { ok: false as const, error: "empty-credentials" as const };
    }

    credentials[field.name] = value;
  }

  return {
    ok: true as const,
    value: credentials,
  };
}

export function getCoverProviderCredentialHint(credentials: Record<string, string>) {
  const firstValue = Object.values(credentials).find((value) => value.trim());
  const suffix = firstValue?.slice(-4);

  return suffix ? `•••• ${suffix}` : "••••";
}
