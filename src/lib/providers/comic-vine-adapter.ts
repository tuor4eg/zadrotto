import type { RawSnapshot, SnapshotDescriptor } from "./types";

const ARTIST_WORK = ["penciler", "inker", "colorist", "letterer", "cover"] as const;
export type ComicVineArtistWork = typeof ARTIST_WORK[number];
export type ComicVineCreatorReference = {
  externalId: string;
  name: string;
  roleCode: "publisher" | "screenwriter" | "artist";
  position: number;
  work?: ComicVineArtistWork[];
};

type Snapshot = Pick<RawSnapshot, "providerCode" | "externalId" | "payload">;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function descriptor(resourceType: "volume" | "issue", externalId: string): SnapshotDescriptor {
  if (!/^[1-9]\d*$/.test(externalId) || !Number.isSafeInteger(Number(externalId))) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { providerCode: "comic-vine", resourceType, externalId, apiMethod: `${resourceType}.details`, requestParams: { version: 1 } };
}
export const describeComicVineVolume = (externalId: string) => descriptor("volume", externalId);
export const describeComicVineIssue = (externalId: string) => descriptor("issue", externalId);

export function normalizeComicVineVolume(snapshot: Snapshot) {
  describeComicVineVolume(snapshot.externalId);
  const raw = object(snapshot.payload);
  const volume = raw?.results === undefined ? raw : object(raw.results);
  if (snapshot.providerCode !== "comic-vine" || volume?.id !== Number(snapshot.externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const publisher = volume.publisher === null ? null : object(volume.publisher);
  if (volume.publisher !== null && !publisher) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const firstIssue = volume.first_issue === null ? null : object(volume.first_issue);
  if (volume.first_issue !== null && (!firstIssue || !validId(firstIssue.id))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  if (publisher && (!validId(publisher.id) || typeof publisher.name !== "string" || !publisher.name.trim())) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const year = Number(volume.start_year);
  const values = { publisher: publisher?.name, issueCount: volume.count_of_issues, startYear: Number.isInteger(year) && year > 0 ? year : null };
  const facts = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null && value !== undefined && (typeof value !== "string" || value.trim())));
  const creators: ComicVineCreatorReference[] = publisher ? [{ externalId: `publisher:${publisher.id}`, name: (publisher.name as string).trim(), roleCode: "publisher", position: 0 }] : [];
  return { provider: "comic-vine" as const, externalId: snapshot.externalId,
    sourceUrl: typeof volume.site_detail_url === "string" ? volume.site_detail_url : null,
    firstIssueId: firstIssue ? String(firstIssue.id) : null, facts, creators };
}

export function normalizeComicVineIssue(snapshot: Snapshot, volumeId: string): ComicVineCreatorReference[] {
  describeComicVineIssue(snapshot.externalId);
  describeComicVineVolume(volumeId);
  const raw = object(snapshot.payload);
  const issue = raw?.results === undefined ? raw : object(raw.results);
  const volume = object(issue?.volume);
  if (snapshot.providerCode !== "comic-vine" || issue?.id !== Number(snapshot.externalId) || volume?.id !== Number(volumeId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  if (!Array.isArray(issue.person_credits)) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const creators = new Map<string, ComicVineCreatorReference>();
  const names = new Map<string, string>();
  issue.person_credits.forEach((value, position) => {
    const person = object(value);
    if (!person || !validId(person.id) || typeof person.name !== "string" || !person.name.trim() || typeof person.role !== "string") throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    const roles = person.role.split(",").map(role => role.trim().toLowerCase());
    const externalId = `person:${person.id}`;
    const knownName = names.get(externalId);
    if (knownName !== undefined && knownName !== person.name.trim()) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    names.set(externalId, person.name.trim());
    for (const roleCode of ["screenwriter", "artist"] as const) {
      const work = ARTIST_WORK.filter(role => roles.includes(role));
      if (roleCode === "screenwriter" ? !roles.includes("writer") : !work.length) continue;
      const key = `${externalId}:${roleCode}`;
      const existing = creators.get(key);
      if (existing && existing.name !== person.name.trim()) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
      if (existing && roleCode === "artist") existing.work = [...new Set([...(existing.work ?? []), ...work])];
      if (!existing) creators.set(key, { externalId, name: person.name.trim(), roleCode, position, ...(roleCode === "artist" ? { work } : {}) });
    }
  });
  return [...creators.values()];
}
