import { hasPredominantlyCyrillicName } from "@/lib/creators/name-localization";
import { parseFantlabAuthorSnapshot, parseFantlabId } from "@/lib/creators/fantlab-api";
import { creatorProfileDescriptor } from "./creator-profile-targets";
import { isCreatorDate } from "@/lib/creators/life-dates";
import { snapshotHash } from "./snapshot-values";
import type { JSONValue, SnapshotDescriptor } from "./types";

export function fantlabAuthorDescriptor(id: string): SnapshotDescriptor {
  return creatorProfileDescriptor({ provider: "fantlab", resourceType: "author", externalId: parseFantlabId(id) });
}

export function mapFantlabAuthorDates(snapshot: SnapshotDescriptor & { payload: JSONValue }) {
  const expected = fantlabAuthorDescriptor(snapshot.externalId);
  if (snapshot.providerCode !== expected.providerCode || snapshot.resourceType !== expected.resourceType || snapshot.apiMethod !== expected.apiMethod
    || snapshotHash(snapshot.requestParams) !== snapshotHash(expected.requestParams)) throw new Error("INVALID_CREATOR_SNAPSHOT");
  const row = parseFantlabAuthorSnapshot(snapshot.payload, expected.externalId);
  const diagnostics: string[] = [0, "0", false].includes(row.is_opened as number | string | boolean) ? ["fantlab-profile-not-opened"] : [];
  function date(key: string) {
    const value = row[key];
    if (value === null || value === undefined || value === "") return null;
    if (isCreatorDate(value)) return value;
    diagnostics.push(`invalid-${key}`);
    return null;
  }
  return { birthDate: date("birthday"), deathDate: date("deathday"), diagnostics };
}

export function mapTmdbPersonDates(snapshot: SnapshotDescriptor & { payload: JSONValue }) {
  const expected = creatorProfileDescriptor({ provider: "tmdb", resourceType: "person", externalId: snapshot.externalId });
  if (snapshot.providerCode !== expected.providerCode || snapshot.resourceType !== expected.resourceType || snapshot.apiMethod !== expected.apiMethod
    || snapshotHash(snapshot.requestParams) !== snapshotHash(expected.requestParams)) throw new Error("INVALID_CREATOR_SNAPSHOT");
  const row = snapshot.payload;
  if (!row || typeof row !== "object" || Array.isArray(row) || String(row.id) !== snapshot.externalId || typeof row.name !== "string" || !row.name.trim()) throw new Error("INVALID_CREATOR_SNAPSHOT");
  const diagnostics: string[] = [];
  function date(key: string) {
    const value = row as Record<string, JSONValue>;
    if (value[key] === null || value[key] === undefined || value[key] === "") return null;
    if (isCreatorDate(value[key])) return value[key];
    diagnostics.push(`invalid-${key}`);
    return null;
  }
  return { birthDate: date("birthday"), deathDate: date("deathday"), diagnostics };
}

/** Only canonical names from verified Russian-language profile responses, never aliases. */
export function mapCreatorProviderRussianName(snapshot: SnapshotDescriptor & { payload: JSONValue }): string | null {
  if (snapshot.providerCode === "fantlab") mapFantlabAuthorDates(snapshot);
  else if (snapshot.providerCode === "tmdb") mapTmdbPersonDates(snapshot);
  else return null;
  const row = snapshot.providerCode === "fantlab" ? parseFantlabAuthorSnapshot(snapshot.payload, snapshot.externalId) : snapshot.payload as Record<string, JSONValue>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  return name && name.length <= 200 && !/[\p{Cc}\p{Cf}]/u.test(name) && hasPredominantlyCyrillicName(name) ? name : null;
}
