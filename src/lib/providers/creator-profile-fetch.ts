import { parseAniListPersonImage } from "@/lib/creators/anilist-person-image";
import { fetchAniList } from "@/lib/covers/anilist-request";
import { getFantlabAuthorRaw, parseFantlabAuthorSnapshot, retryAfterMs } from "@/lib/creators/fantlab-api";
import { getIgdbAccessToken } from "@/lib/covers/providers/igdb";
import { fetchGameProvider } from "@/lib/covers/game-provider-budget";
import { getActiveProviderRequestTimeoutMs, withProviderTimeout } from "@/lib/covers/providers/shared";
import type { ProviderSearchOptions } from "@/lib/covers/types";
import { boundedJson, SnapshotProviderHttpError } from "./book-fetch";
import { parseCreatorProfileTarget, IGDB_COMPANY_PROFILE_FIELDS, type CreatorProfileTarget } from "./creator-profile-targets";
import type { JSONValue } from "./types";

export function validateCreatorProfilePayload(target: CreatorProfileTarget, payload: JSONValue) {
  if (target.provider === "comic-vine") {
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.status_code !== 1 || !payload.results || typeof payload.results !== "object" || Array.isArray(payload.results) || String(payload.results.id) !== target.externalId || typeof payload.results.name !== "string" || !payload.results.name.trim()) throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
    return;
  }
  if (target.provider === "anilist") { parseAniListPersonImage(payload, target.externalId); return; }
  if (target.provider === "fantlab") { parseFantlabAuthorSnapshot(payload, target.externalId); return; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || String(payload.id) !== target.externalId || typeof payload.name !== "string" || !payload.name.trim()) throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
}

export type CreatorProfileRawOptions = {
  signal: AbortSignal;
  credentials: ProviderSearchOptions["providerCredentials"];
  requestStartedAt: () => Promise<Date>;
  beforeRequest?: (provider: CreatorProfileTarget["provider"]) => Promise<void>;
  fetchImpl?: typeof fetch;
  anilistFetch?: typeof fetchAniList;
  gameFetch?: typeof fetchGameProvider;
  igdbToken?: typeof getIgdbAccessToken;
  fantlabRaw?: typeof getFantlabAuthorRaw;
};
export async function fetchCreatorProfileRaw(input: CreatorProfileTarget, options: CreatorProfileRawOptions) {
  const target = parseCreatorProfileTarget(input);
  options.signal.throwIfAborted();
  let requestStartedAt: Date | undefined;
  let payload: JSONValue;
  if (target.provider === "roblox") {
    const user = target.resourceType === "user";
    const get = async (url: URL) => {
      await options.beforeRequest?.("roblox");
      requestStartedAt ??= await options.requestStartedAt();
      const response = await (options.fetchImpl ?? fetch)(url, { headers: { accept: "application/json" }, redirect: "error", signal: withProviderTimeout(getActiveProviderRequestTimeoutMs(), options.signal) });
      if (!response.ok) {
        const retry = Math.ceil(retryAfterMs(response.headers.get("retry-after")) / 1000);
        await response.body?.cancel();
        throw new SnapshotProviderHttpError(response.status, retry);
      }
      return boundedJson(response);
    };
    const profile = await get(new URL(user ? `https://users.roblox.com/v1/users/${target.externalId}` : `https://groups.roblox.com/v1/groups/${target.externalId}`));
    if (!profile || typeof profile !== "object" || Array.isArray(profile) || String(profile.id) !== target.externalId || typeof profile.name !== "string") throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
    const url = new URL(user ? "https://thumbnails.roblox.com/v1/users/avatar-headshot" : "https://thumbnails.roblox.com/v1/groups/icons");
    url.searchParams.set(user ? "userIds" : "groupIds", target.externalId);
    url.searchParams.set("size", "420x420");
    url.searchParams.set("format", "Png");
    url.searchParams.set("isCircular", "false");
    let imageUrl: string | null = null;
    let thumbnail: JSONValue = null;
    try {
      const result = await get(url);
      thumbnail = result;
      const data = result && typeof result === "object" && !Array.isArray(result) && Array.isArray(result.data) ? result.data : [];
      const image = data.find(value => value && typeof value === "object" && !Array.isArray(value) && value.targetId === Number(target.externalId));
      if (image && typeof image === "object" && !Array.isArray(image) && image.state === "Completed" && typeof image.imageUrl === "string") imageUrl = image.imageUrl;
    } catch (error) {
      if (options.signal.aborted || error instanceof SnapshotProviderHttpError && error.status === 429
        || error instanceof Error && ["provider-daily-limit", "rate-limit-unavailable"].includes(error.message)
        || error && typeof error === "object" && "code" in error && error.code === "provider-deferred") throw error;
    }
    payload = { ...profile, imageUrl, thumbnail };
  } else if (target.provider === "fantlab") {
    await options.beforeRequest?.(target.provider);
    payload = await (options.fantlabRaw ?? getFantlabAuthorRaw)(target.externalId, options.signal, async () => { requestStartedAt = await options.requestStartedAt(); });
  } else {
    const credentials = options.credentials;
    const headers: Record<string, string> = { accept: "application/json" };
    let url: URL;
    let body: string | undefined;
    if (target.provider === "anilist") {
      headers["content-type"] = "application/json";
      url = new URL("https://graphql.anilist.co");
      body = JSON.stringify({ query: "query StaffImage($id:Int!) { Staff(id:$id) { id name { full } image { large medium } siteUrl } }", variables: { id: Number(target.externalId) } });
    } else if (target.provider === "igdb") {
      const auth = credentials?.igdb;
      if (!auth?.clientId || !auth.clientSecret) throw new Error("Не настроены учётные данные IGDB.");
      const token = await (options.igdbToken ?? getIgdbAccessToken)({ clientId: auth.clientId, clientSecret: auth.clientSecret });
      if (!token) throw new Error("Не удалось авторизоваться в IGDB.");
      headers["Client-ID"] = auth.clientId;
      headers.Authorization = `Bearer ${token}`;
      url = new URL("https://api.igdb.com/v4/companies");
      body = `fields ${IGDB_COMPANY_PROFILE_FIELDS}; where id = ${target.externalId}; limit 1;`;
    } else if (target.provider === "comic-vine") {
      const key = credentials?.["comic-vine"]?.apiKey?.trim();
      if (!key) throw new Error("Не настроены учётные данные Comic Vine.");
      url = new URL(`https://comicvine.gamespot.com/api/${target.resourceType}/${target.resourceType === "person" ? "4040" : "4010"}-${target.externalId}/`);
      url.searchParams.set("api_key", key);
      url.searchParams.set("format", "json");
      headers["User-Agent"] = "geekoteka/1.0 comic archive";
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
    const beforeRequest = async () => {
      await options.beforeRequest?.(target.provider);
      requestStartedAt = await options.requestStartedAt();
    };
    if (target.provider !== "anilist") await beforeRequest();
    const init = { headers, body, method: body ? "POST" : "GET", redirect: "error" as const,
      signal: target.provider === "anilist" ? options.signal : withProviderTimeout(getActiveProviderRequestTimeoutMs(), options.signal) };
    const response = target.provider === "anilist"
      ? await (options.anilistFetch ?? fetchAniList)(url, init, { fetchImpl: options.fetchImpl, beforeRequest })
      : target.provider === "tmdb" || target.provider === "comic-vine" ? await (options.fetchImpl ?? fetch)(url, init) : await (options.gameFetch ?? fetchGameProvider)(target.provider, url, init);
    if (!response.ok) {
      const retry = Math.ceil(retryAfterMs(response.headers.get("retry-after")) / 1000);
      await response.body?.cancel();
      throw new SnapshotProviderHttpError(response.status, retry);
    }
    payload = await boundedJson(response);
    if (target.provider === "anilist") {
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.errors !== undefined || !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data) || !payload.data.Staff) throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
      payload = payload.data.Staff;
    }
    if (target.provider === "igdb") {
      if (!Array.isArray(payload) || payload.length !== 1) throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
      payload = payload[0];
    }
  }
  options.signal.throwIfAborted();
  validateCreatorProfilePayload(target, payload);
  return { payload, requestStartedAt: requestStartedAt! };
}
