import { parseFantlabAuthorSnapshot, parseFantlabId } from "@/lib/creators/fantlab-api";
import { isCreatorDate } from "@/lib/creators/life-dates";
import { snapshotHash } from "./snapshot-values";
import type { JSONValue, SnapshotDescriptor } from "./types";

export function fantlabAuthorDescriptor(id: string): SnapshotDescriptor {
  return { providerCode: "fantlab", resourceType: "author", externalId: parseFantlabId(id), apiMethod: "autor.get", requestParams: { biography: 1, awards: 1 } };
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
