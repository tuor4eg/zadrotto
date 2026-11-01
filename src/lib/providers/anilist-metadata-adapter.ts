import type { RawSnapshot, SnapshotDescriptor } from "./types";

export const ANILIST_MEDIA_FIELDS = `
  id idMal
  title { english romaji native }
  description(asHtml: false)
  coverImage { extraLarge large medium }
  siteUrl startDate { year } seasonYear popularity
  episodes duration format genres status
  studios { nodes { name } }
`;

export const ANILIST_METADATA_FACT_KEYS = ["episodeCount", "status", "animeType", "averageEpisodeRuntimeMinutes"] as const;

export function describeAniListMetadata(externalId: string): SnapshotDescriptor {
  if (!/^[1-9]\d*$/.test(externalId) || !Number.isSafeInteger(Number(externalId))) throw new Error("INVALID_ANILIST_ID");
  return { providerCode: "anilist", resourceType: "anime", externalId, apiMethod: "anime.details", requestParams: { version: 1 } };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeAniListMetadata(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  describeAniListMetadata(snapshot.externalId);
  const response = record(snapshot.payload);
  const media = record(record(response?.data)?.Media);
  if (snapshot.providerCode !== "anilist" || response?.errors !== undefined || media?.id !== Number(snapshot.externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  for (const key of ["episodes", "duration"]) {
    if (media[key] !== null && (!Number.isSafeInteger(media[key]) || Number(media[key]) < 0)) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  }
  for (const key of ["status", "format"]) {
    if (media[key] !== null && (typeof media[key] !== "string" || !media[key].trim())) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  }
  const rawGenres = media.genres === null ? [] : media.genres;
  if (!Array.isArray(rawGenres) || rawGenres.some(value => typeof value !== "string" || !value.trim())) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const genres = [...new Set(rawGenres.map(value => (value as string).trim()))];
  const titleFields = record(media.title);
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
  const title = text(titleFields?.english) ?? text(titleFields?.romaji) ?? text(titleFields?.native);
  const originalTitle = text(titleFields?.romaji) ?? text(titleFields?.native);
  const year = media.seasonYear ?? record(media.startDate)?.year;
  return {
    provider: "anilist" as const, externalId: snapshot.externalId,
    sourceUrl: `https://anilist.co/anime/${snapshot.externalId}`,
    facts: Object.fromEntries(Object.entries({ episodeCount: media.episodes, status: media.status,
      animeType: media.format, averageEpisodeRuntimeMinutes: media.duration }).filter(([, value]) => value !== null)),
    genreFacts: { genres },
    idMal: Number.isSafeInteger(media.idMal) && Number(media.idMal) > 0 ? Number(media.idMal) : null,
    fields: {
      ...(title ? { title } : {}),
      ...(originalTitle ? { originalTitle: originalTitle === title ? null : originalTitle } : {}),
      ...(text(media.description) ? { description: text(media.description)! } : {}),
      ...(Number.isSafeInteger(year) && Number(year) > 0 ? { releaseYear: Number(year) } : {}),
    },
  };
}
