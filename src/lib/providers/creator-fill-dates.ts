import { isCreatorDate, type CreatorLifeDates } from "@/lib/creators/life-dates";
import { mapFantlabAuthorDates, mapTmdbPersonDates } from "./creator-adapters";
import { CREATOR_FIELDS_FILL_RESOURCES, creatorFillDatesDescriptor, creatorProfileDescriptor, type CreatorProfileTarget } from "./creator-profile-targets";
import { snapshotHash } from "./snapshot-values";
import type { JSONValue, SnapshotDescriptor } from "./types";

type DatesProjection = CreatorLifeDates & { diagnostics: string[]; reviewDates?: Partial<CreatorLifeDates> };
type Snapshot = SnapshotDescriptor & { payload: JSONValue };

export function supportsCreatorFillDates(target: CreatorProfileTarget): boolean {
  return Object.hasOwn(CREATOR_FIELDS_FILL_RESOURCES, target.provider)
    && CREATOR_FIELDS_FILL_RESOURCES[target.provider as keyof typeof CREATOR_FIELDS_FILL_RESOURCES] === target.resourceType;
}

function object(value: JSONValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function validateAniListDatesProfile(payload: JSONValue, externalId: string) {
  const row = object(payload);
  const name = object(row?.name)?.full;
  if (!row || String(row.id) !== externalId || typeof name !== "string" || !name.trim()
    || !("dateOfBirth" in row) || !("dateOfDeath" in row)) throw new Error("INVALID_CREATOR_PROFILE_RESPONSE");
  return row;
}

function matchesDescriptor(snapshot: SnapshotDescriptor, expected: SnapshotDescriptor) {
  return snapshot.providerCode === expected.providerCode && snapshot.resourceType === expected.resourceType
    && snapshot.externalId === expected.externalId && snapshot.apiMethod === expected.apiMethod
    && snapshotHash(snapshot.requestParams) === snapshotHash(expected.requestParams);
}

function aniListDate(value: JSONValue | undefined, field: string, diagnostics: string[]) {
  if (value == null) return null;
  const date = object(value);
  if (date && (date.year == null || date.month == null || date.day == null)) {
    if (date.year != null || date.month != null || date.day != null) diagnostics.push(`partial-${field}`);
    return null;
  }
  if (date && [date.year, date.month, date.day].every(Number.isInteger)) {
    const iso = `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
    if (isCreatorDate(iso)) return iso;
  }
  diagnostics.push(`invalid-${field}`);
  return null;
}

function comicVineDate(value: JSONValue | undefined, field: "birth" | "death", diagnostics: string[], reviewDates: Partial<CreatorLifeDates>) {
  if (value == null || value === "") return null;
  // Keep the provider's calendar day even when its datetime includes an offset.
  const date = typeof value === "string"
    ? /^([0-9]{4}-[0-9]{2}-[0-9]{2})(?:[ T](?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]+)?(?:Z|[+-](?:[01][0-9]|2[0-3]):?[0-5][0-9])?)?$/.exec(value)?.[1]
    : undefined;
  if (!isCreatorDate(date)) {
    diagnostics.push(`invalid-${field}`);
    return null;
  }
  if (date.endsWith("-01-01")) {
    diagnostics.push(`ambiguous-${field}`);
    reviewDates[field === "birth" ? "birthDate" : "deathDate"] = date;
    return null;
  }
  return date;
}

function igdbStartDate(row: Record<string, JSONValue>, diagnostics: string[]) {
  if (row.start_date == null) return null;
  const reference = row.start_date_format;
  const format = object(reference)?.format;
  const precisionId = reference == null ? row.start_date_category : reference;
  // IGDB /date_formats identifies YYYYMMDD as 0, including in saved company profiles.
  const exact = format == null ? precisionId === 0 : format === "YYYYMMDD";
  if (!exact) {
    const knownPartial = typeof format === "string" && ["YYYYMM", "YYYY", "YYYYQ1", "YYYYQ2", "YYYYQ3", "YYYYQ4", "TBD"].includes(format)
      || typeof precisionId === "number" && Number.isInteger(precisionId) && precisionId >= 1 && precisionId <= 7;
    diagnostics.push(knownPartial ? "partial-start_date" : "unverified-start_date-precision");
    return null;
  }
  if (typeof row.start_date === "number" && Number.isSafeInteger(row.start_date)) {
    const timestamp = new Date(row.start_date * 1000);
    if (!Number.isNaN(timestamp.getTime())) {
      const date = timestamp.toISOString().split("T")[0];
      if (isCreatorDate(date)) return date;
    }
  }
  diagnostics.push("invalid-start_date");
  return null;
}

export function projectCreatorFillDates(target: CreatorProfileTarget, snapshot: Snapshot): DatesProjection {
  if (!supportsCreatorFillDates(target)) throw new Error("UNSUPPORTED_CREATOR_DATES_PROVIDER");
  const descriptorMatches = matchesDescriptor(snapshot, creatorFillDatesDescriptor(target))
    || (target.provider === "igdb" && matchesDescriptor(snapshot, creatorProfileDescriptor(target)));
  if (!descriptorMatches) throw new Error("INVALID_CREATOR_SNAPSHOT");
  if (target.provider === "fantlab") return mapFantlabAuthorDates(snapshot);
  if (target.provider === "tmdb") return mapTmdbPersonDates(snapshot);
  const diagnostics: string[] = [];
  if (target.provider === "anilist") {
    const row = validateAniListDatesProfile(snapshot.payload, target.externalId);
    return {
      birthDate: aniListDate(row.dateOfBirth, "dateOfBirth", diagnostics),
      deathDate: aniListDate(row.dateOfDeath, "dateOfDeath", diagnostics),
      diagnostics,
    };
  }
  const payload = object(snapshot.payload);
  const row = target.provider === "comic-vine" && payload?.status_code === 1 ? object(payload.results) : payload;
  if (!row || String(row.id) !== target.externalId || typeof row.name !== "string" || !row.name.trim()
    || (target.provider === "comic-vine" && payload?.status_code !== 1)) throw new Error("INVALID_CREATOR_SNAPSHOT");
  if (target.provider === "igdb") return { birthDate: igdbStartDate(row, diagnostics), deathDate: null, diagnostics };
  const reviewDates: Partial<CreatorLifeDates> = {};
  const birthDate = comicVineDate(row.birth, "birth", diagnostics, reviewDates);
  const death = object(row.death);
  if (row.death != null && (!death || !("date" in death))) diagnostics.push("invalid-death");
  const deathDate = comicVineDate(death?.date, "death", diagnostics, reviewDates);
  return {
    birthDate,
    deathDate,
    diagnostics,
    ...(Object.keys(reviewDates).length ? { reviewDates } : {}),
  };
}
