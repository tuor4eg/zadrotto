import { getFantlabAuthorRaw, parseFantlabAuthorSnapshot, retryAfterMs } from "@/lib/creators/fantlab-api";
import { getIgdbAccessToken } from "@/lib/covers/providers/igdb";
import { fetchGameProvider } from "@/lib/covers/game-provider-budget";
import { getActiveProviderRequestTimeoutMs, withProviderTimeout } from "@/lib/covers/providers/shared";
import type { ProviderSearchOptions } from "@/lib/covers/types";
import { boundedJson, SnapshotProviderHttpError } from "./book-fetch";
import { parseCreatorProfileTarget, IGDB_COMPANY_PROFILE_FIELDS, type CreatorProfileTarget } from "./creator-profile-targets";
import type { JSONValue } from "./types";

export function validateCreatorProfilePayload(target: CreatorProfileTarget, payload: JSONValue) {
  if (target.provider === "fantlab") { parseFantlabAuthorSnapshot(payload, target.externalId); return; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || String(payload.id) !== target.externalId || typeof payload.name !== "string" || !payload.name.trim()) throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
}

export type CreatorProfileRawOptions = {
  signal: AbortSignal;
  credentials: ProviderSearchOptions["providerCredentials"];
  requestStartedAt: () => Promise<Date>;
  beforeRequest?: (provider: CreatorProfileTarget["provider"]) => Promise<void>;
  fetchImpl?: typeof fetch;
  gameFetch?: typeof fetchGameProvider;
  igdbToken?: typeof getIgdbAccessToken;
  fantlabRaw?: typeof getFantlabAuthorRaw;
};
export async function fetchCreatorProfileRaw(input: CreatorProfileTarget, options: CreatorProfileRawOptions) {
  const target = parseCreatorProfileTarget(input);
  options.signal.throwIfAborted();
  let requestStartedAt: Date | undefined;
  let payload: JSONValue;
  if (target.provider === "fantlab") {
    await options.beforeRequest?.(target.provider);
    payload = await (options.fantlabRaw ?? getFantlabAuthorRaw)(target.externalId, options.signal, async () => { requestStartedAt = await options.requestStartedAt(); });
  } else {
    const credentials = options.credentials;
    const headers: Record<string, string> = { accept: "application/json" };
    let url: URL;
    let body: string | undefined;
    if (target.provider === "igdb") {
      const auth = credentials?.igdb;
      if (!auth?.clientId || !auth.clientSecret) throw new Error("Не настроены учётные данные IGDB.");
      const token = await (options.igdbToken ?? getIgdbAccessToken)({ clientId: auth.clientId, clientSecret: auth.clientSecret });
      if (!token) throw new Error("Не удалось авторизоваться в IGDB.");
      headers["Client-ID"] = auth.clientId;
      headers.Authorization = `Bearer ${token}`;
      url = new URL("https://api.igdb.com/v4/companies");
      body = `fields ${IGDB_COMPANY_PROFILE_FIELDS}; where id = ${target.externalId}; limit 1;`;
    } else if (target.provider === "rawg") {
      const key = credentials?.rawg?.apiKey;
      if (!key) throw new Error("Не настроены учётные данные RAWG.");
      url = new URL(`https://api.rawg.io/api/${target.resourceType}s/${target.externalId}`);
      url.searchParams.set("key", key);
    } else {
      const token = credentials?.tmdb?.accessToken?.trim();
      if (!token) throw new Error("Не настроены учётные данные TMDB.");
      headers.Authorization = `Bearer ${token}`;
      url = new URL(`https://api.themoviedb.org/3/${target.resourceType}/${target.externalId}`);
    }
    if (target.provider === "tmdb" && target.resourceType === "person") url.searchParams.set("language", "ru-RU");
    await options.beforeRequest?.(target.provider);
    requestStartedAt = await options.requestStartedAt();
    const init = { headers, body, method: body ? "POST" : "GET", redirect: "error" as const, signal: withProviderTimeout(getActiveProviderRequestTimeoutMs(), options.signal) };
    const response = target.provider === "tmdb" ? await (options.fetchImpl ?? fetch)(url, init) : await (options.gameFetch ?? fetchGameProvider)(target.provider, url, init);
    if (!response.ok) {
      const retry = Math.ceil(retryAfterMs(response.headers.get("retry-after")) / 1000);
      await response.body?.cancel();
      throw new SnapshotProviderHttpError(response.status, retry);
    }
    payload = await boundedJson(response);
    if (target.provider === "igdb") {
      if (!Array.isArray(payload) || payload.length !== 1) throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
      payload = payload[0];
    }
  }
  options.signal.throwIfAborted();
  validateCreatorProfilePayload(target, payload);
  return { payload, requestStartedAt: requestStartedAt! };
}
