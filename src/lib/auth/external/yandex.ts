import * as oauth from "oauth4webapi";
import { createOAuthAdapter } from "./oauth";
import { boundedOAuthResponse } from "./response";
import type { ExternalIdentity } from "./model";

export function parseYandexIdentity(value: unknown, clientId: string): ExternalIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Yandex profile");
  const profile = value as Record<string, unknown>;
  if (typeof profile.id !== "string" || !profile.id.trim() || profile.id.length > 1024 || /[\u0000-\u0020\u007f]/u.test(profile.id)
    || profile.client_id !== clientId) throw new Error("Invalid Yandex identity");
  const name = [profile.real_name, profile.display_name, profile.login]
    .find((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate.trim()) && candidate.trim().length <= 80);
  const avatarId = profile.default_avatar_id;
  return {
    subject: profile.id,
    name: name?.trim() ?? null,
    displayValue: typeof profile.login === "string" ? profile.login.slice(0, 200) : null,
    avatarUrl: profile.is_avatar_empty === false && typeof avatarId === "string"
      && /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(avatarId) && avatarId.length <= 256
      ? `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200` : null,
  };
}

export function createYandexAdapter(config: { enabled: boolean; credentials: { clientId: string; clientSecret: string } | null; revision: string }) {
  const credentials = config.credentials;
  return {
    ...createOAuthAdapter({
      code: "yandex", name: "Яндекс ID", protocol: "oauth2", enabled: config.enabled,
      configured: Boolean(credentials?.clientId && credentials?.clientSecret),
      server: { issuer: "https://oauth.yandex.ru", authorization_endpoint: "https://oauth.yandex.ru/authorize", token_endpoint: "https://oauth.yandex.ru/token" },
      client: { client_id: credentials?.clientId ?? "unconfigured" },
      clientAuthentication: oauth.ClientSecretBasic(credentials?.clientSecret ?? "unconfigured"),
      scopes: ["login:info", "login:avatar"], avatarOrigins: ["https://avatars.yandex.net"],
      async resolveOAuthIdentity(accessToken) {
        const response = await fetch("https://login.yandex.ru/info?format=json", {
          headers: { Authorization: `OAuth ${accessToken}`, Accept: "application/json" },
          redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) { await response.body?.cancel(); throw new Error("Yandex profile unavailable"); }
        return parseYandexIdentity(await (await boundedOAuthResponse(response)).json(), credentials!.clientId);
      },
    }),
    configurationRevision: config.revision,
  };
}
