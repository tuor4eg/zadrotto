export const EXTERNAL_AUTH_PROVIDER_DEFINITIONS = [{
  code: "yandex", name: "Яндекс ID",
  fields: [
    { name: "clientId", label: "Client ID", secret: false },
    { name: "clientSecret", label: "Client Secret", secret: true },
  ],
}] as const;
export type AuthProviderCode = typeof EXTERNAL_AUTH_PROVIDER_DEFINITIONS[number]["code"];
export function isAuthProviderCode(value: string): value is AuthProviderCode {
  return EXTERNAL_AUTH_PROVIDER_DEFINITIONS.some((provider) => provider.code === value);
}

export const AUTH_PROVIDER_DEFINITIONS = EXTERNAL_AUTH_PROVIDER_DEFINITIONS;
