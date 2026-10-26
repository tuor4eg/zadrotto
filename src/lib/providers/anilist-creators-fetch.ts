import { boundedJson, SnapshotProviderHttpError } from "./book-fetch";
import { fetchAniList, aniListRetryAfterSeconds } from "@/lib/covers/anilist-request";
import type { AniListCreatorProgress } from "./anilist-creator-progress";
import type { TitleMetadataOptions } from "@/lib/covers/types";
import type { JSONValue } from "./types";
import { parseAniListCreatorPayload, type AniListCreatorPayload } from "./anilist-creators-adapter";

/** Fetch all pages before returning any evidence. Partial GraphQL data is never a complete roster. */
export async function fetchAniListCreatorPayload(input: { externalId: string; byMalId?: boolean }, options: TitleMetadataOptions, dependencies: {
  request?: typeof fetchAniList; progress?: AniListCreatorProgress;
} = {}) {
  if (!/^[1-9][0-9]*$/.test(input.externalId) || !Number.isSafeInteger(Number(input.externalId))) throw new Error("INVALID_ANILIST_ID");
  const staff: AniListCreatorPayload["staff"] = [];
  let studios: { id: number; name: string; isAnimationStudio: boolean }[] = [];
  const responses: JSONValue[] = [];
  let mediaId: number | undefined;
  let idMal: number | null = null;
  for (let page = 1; ; page++) {
    options.signal?.throwIfAborted();
    const cached = dependencies.progress?.read(page);
    let raw: JSONValue;
    if (cached) raw = cached;
    else {
    const response = await (dependencies.request ?? fetchAniList)("https://graphql.anilist.co", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, redirect: "error",
      signal: options.signal,
      body: JSON.stringify({ query: `query AnimeCreators($id:Int!,$page:Int!) {
        Media(${input.byMalId ? "idMal" : "id"}:$id,type:ANIME) {
          id idMal staff(page:$page,perPage:25,sort:ID) { pageInfo { currentPage hasNextPage } edges { role node { id name { full } image { large medium } siteUrl } } }
          ${page === 1 ? "studios { pageInfo { hasNextPage } nodes { id name isAnimationStudio } }" : ""}
        }
      }`, variables: { id: Number(input.externalId), page } }),
    }, { beforeRequest: async () => {
      const allowed = await options.beforeProviderSearch?.("anilist");
      if (allowed === false || typeof allowed === "string") throw new Error(typeof allowed === "string" ? allowed : "provider-daily-limit");
    } });
    if (!response.ok) {
      const retry = aniListRetryAfterSeconds(response.headers);
      await response.body?.cancel();
      throw new SnapshotProviderHttpError(response.status, retry);
    }
    raw = await boundedJson(response);
    }
    options.signal?.throwIfAborted();
    const result = raw as unknown as { errors?: unknown[]; data?: { Media?: {
      id: number; idMal: number | null;
      staff: { pageInfo: { currentPage: number; hasNextPage: boolean }; edges: { role: string; node: { id: number; name: { full: string }; image?: {large?:string|null;medium?:string|null}|null; siteUrl?:string|null } }[] };
      studios?: { pageInfo: { hasNextPage: boolean }; nodes: typeof studios };
    } | null } };
    if (result.errors !== undefined) throw new Error("ANILIST_GRAPHQL_ERROR");
    const media = result.data?.Media;
    if (page === 1 && media === null && input.byMalId) return null;
    if (!media || !Number.isSafeInteger(media.id) || media.id <= 0 || !media.staff?.pageInfo
      || media.staff.pageInfo.currentPage !== page || typeof media.staff.pageInfo.hasNextPage !== "boolean"
      || !Array.isArray(media.staff.edges) || (page > 1 && media.id !== mediaId)
      || (input.byMalId ? media.idMal !== Number(input.externalId) : media.id !== Number(input.externalId))) throw new Error("INVALID_ANILIST_ROSTER");
    if (page === 1) {
      if (!media.studios || !Array.isArray(media.studios.nodes) || media.studios.pageInfo?.hasNextPage !== false) throw new Error("INCOMPLETE_ANILIST_STUDIOS");
      studios = media.studios.nodes;
      mediaId = media.id;
      idMal = media.idMal;
    } else if (idMal !== media.idMal) throw new Error("ANILIST_SOURCE_CHANGED");
    for (const edge of media.staff.edges) {
      if (!edge?.node?.name) throw new Error("INVALID_ANILIST_ROSTER");
      staff.push({ id: edge.node.id, name: edge.node.name.full, role: edge.role, ...("image" in edge.node ? { image: edge.node.image } : {}), ...("siteUrl" in edge.node ? { siteUrl: edge.node.siteUrl } : {}) });
    }
    responses.push(raw);
    parseAniListCreatorPayload({ mediaId, idMal, staff, studios, complete: true });
    if (!cached) await dependencies.progress?.write(page, raw);
    if (!media.staff.pageInfo.hasNextPage) break;
    if (!media.staff.edges.length || page >= 1000) throw new Error("INCOMPLETE_ANILIST_STAFF");
  }
  const payload = { mediaId: mediaId!, idMal, staff, studios, complete: true as const, responses };
  parseAniListCreatorPayload(payload);
  return payload;
}
