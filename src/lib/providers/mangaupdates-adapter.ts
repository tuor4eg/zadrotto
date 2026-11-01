import type { RawSnapshot, SnapshotDescriptor } from "./types";
import { parseMangaVolumeCount } from "@/lib/media/manga-facts";

export type MangaUpdatesCreatorReference = { externalId: string; name: string; roleCode: "writer" | "artist" | "publisher"; position: number };
export function mangaUpdatesRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function positiveId(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
export function describeMangaUpdatesSeries(externalId: string): SnapshotDescriptor {
  if (!/^[1-9]\d*$/.test(externalId) || !Number.isSafeInteger(Number(externalId))) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { providerCode: "mangaupdates", resourceType: "series", externalId, apiMethod: "series.details", requestParams: { version: 1 } };
}
export function mangaUpdatesYear(value: unknown): number | null {
  const match = typeof value === "string" ? value.match(/^(\d{4})(?:\D|$)/) : null;
  return match && Number(match[1]) > 0 ? Number(match[1]) : null;
}
export function mangaUpdatesImage(value: unknown): string | null {
  const urls = mangaUpdatesRecord(mangaUpdatesRecord(value)?.url);
  return typeof urls?.original === "string" && urls.original ? urls.original : typeof urls?.thumb === "string" && urls.thumb ? urls.thumb : null;
}
export function mangaUpdatesCoverCandidates(series: Record<string, unknown> | null, externalId: string) {
  describeMangaUpdatesSeries(externalId);
  if (!series || series.series_id !== Number(externalId) || typeof series.title !== "string" || !series.title.trim()) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  if (series.type === "Novel") return [];
  const image = mangaUpdatesImage(series.image);
  return image ? [{ id: `series:${externalId}`, provider: "mangaupdates" as const, title: series.title.trim(), imageUrl: image, sourcePageUrl: typeof series.url === "string" ? series.url : null, year: mangaUpdatesYear(series.year) ?? undefined }] : [];
}
export function normalizeMangaUpdatesSnapshot(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  describeMangaUpdatesSeries(snapshot.externalId);
  const series = mangaUpdatesRecord(snapshot.payload);
  if (snapshot.providerCode !== "mangaupdates" || series?.series_id !== Number(snapshot.externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  if (typeof series.title !== "string" || !series.title.trim() || typeof series.type !== "string" || !Array.isArray(series.authors) || !Array.isArray(series.publishers) || !Array.isArray(series.genres) || !Array.isArray(series.associated)) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  if (series.type === "Novel") throw new Error("UNSUPPORTED_PROVIDER_MEDIA_TYPE");
  const creators = new Map<string, MangaUpdatesCreatorReference>();
  const names = new Map<string, string>();
  function add(externalId: string, name: unknown, roleCode: MangaUpdatesCreatorReference["roleCode"], position: number) {
    // Publisher histories may repeat one identity under former and current names.
    if (typeof name !== "string" || !name.trim() || roleCode !== "publisher" && names.has(externalId) && names.get(externalId) !== name.trim()) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    if (!names.has(externalId)) names.set(externalId, name.trim());
    const key = `${externalId}:${roleCode}`;
    if (!creators.has(key)) creators.set(key, { externalId, name: name.trim(), roleCode, position });
  }
  series.authors.forEach((value, position) => {
    const author = mangaUpdatesRecord(value);
    if (!author || !["Author", "Artist"].includes(String(author.type)) || typeof author.name !== "string" || !author.name.trim()) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    // Unlinked credits have no provider identity; retain them in the raw snapshot.
    if (author.author_id === null) return;
    if (!positiveId(author.author_id)) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    add(`person:${author.author_id}`, author.name, author.type === "Author" ? "writer" : "artist", position);
  });
  series.publishers.forEach((value, position) => {
    const publisher = mangaUpdatesRecord(value);
    if (!publisher || !positiveId(publisher.publisher_id) || !["Original", "English"].includes(String(publisher.type))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    add(`publisher:${publisher.publisher_id}`, publisher.publisher_name, "publisher", position);
  });
  const genres = series.genres.map(value => {
    const genre = mangaUpdatesRecord(value)?.genre;
    if (typeof genre !== "string" || !genre.trim()) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    return genre.trim();
  });
  const aliases = series.associated.map(value => {
    const title = mangaUpdatesRecord(value)?.title;
    if (typeof title !== "string" || !title.trim()) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    return title.trim();
  });
  const releaseYear = mangaUpdatesYear(series.year);
  const issueCount = parseMangaVolumeCount(series.status);
  return { provider: "mangaupdates" as const, externalId: snapshot.externalId,
    sourceUrl: typeof series.url === "string" ? series.url : null,
    fields: { title: series.title.trim(), aliases: [...new Set(aliases)], ...(releaseYear ? { releaseYear } : {}), ...(typeof series.description === "string" && series.description.trim() ? { description: series.description.trim() } : {}) },
    facts: { genres: [...new Set(genres)], ...(issueCount !== null ? { issueCount } : {}), ...(typeof series.completed === "boolean" ? { completed: series.completed } : {}), ...(typeof series.status === "string" && series.status.trim() ? { status: series.status.trim() } : typeof series.completed === "boolean" ? { status: series.completed ? "Completed" : "Ongoing" } : {}) }, creators: [...creators.values()], coverUrl: mangaUpdatesImage(series.image) };
}
