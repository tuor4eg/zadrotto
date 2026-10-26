import type { JSONValue } from "@/lib/providers/types";

/** AniList portraits use the existing relay's sole AniList image origin. */
export function aniListPortraitUrl(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("INVALID_CREATOR_IMAGE");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("INVALID_CREATOR_IMAGE"); }
  if (url.protocol !== "https:" || url.hostname !== "s4.anilist.co" || url.username || url.password || url.port) throw new Error("INVALID_CREATOR_IMAGE");
  return url.toString();
}
export function parseAniListPersonImage(payload: JSONValue, externalId: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || String(payload.id) !== externalId
    || !payload.name || typeof payload.name !== "object" || Array.isArray(payload.name) || typeof payload.name.full !== "string" || !payload.name.full.trim()
    || !("image" in payload)) throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
  const image = payload.image;
  if (image !== null && (!image || typeof image !== "object" || Array.isArray(image) || (!("large" in image) && !("medium" in image)))) throw new Error("INVALID_CREATOR_IMAGE");
  const urls = image === null ? [] : [...new Set([aniListPortraitUrl(image.large), aniListPortraitUrl(image.medium)].filter((url): url is string => Boolean(url)))];
  const sourceUrl = `https://anilist.co/staff/${externalId}`;
  if (payload.siteUrl != null) {
    if (typeof payload.siteUrl !== "string") throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
    let site: URL;
    try { site = new URL(payload.siteUrl); } catch { throw new Error("INVALID_CREATOR_PROFILE_RESPONSE"); }
    if (site.protocol !== "https:" || site.hostname !== "anilist.co" || site.username || site.password || site.port || !new RegExp(`^/staff/${externalId}(?:/|$)`).test(site.pathname)) throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
  }
  return { urls, sourceUrl };
}
