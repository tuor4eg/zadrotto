import { isCreatorDate, isCreatorYear, type CreatorLifeDates } from "@/lib/creators/life-dates";
import { mapFantlabAuthorDates, mapTmdbPersonDates } from "./creator-adapters";
import { CREATOR_FIELDS_FILL_RESOURCES, creatorFillDatesDescriptor, creatorProfileDescriptor, type CreatorProfileTarget } from "./creator-profile-targets";
import { snapshotHash } from "./snapshot-values";
import type { JSONValue, SnapshotDescriptor } from "./types";

type DatesProjection = CreatorLifeDates & { diagnostics: string[] };
type Snapshot = SnapshotDescriptor & { payload: JSONValue };

export function supportsCreatorFillDates(target: CreatorProfileTarget): boolean {
  if (!Object.hasOwn(CREATOR_FIELDS_FILL_RESOURCES, target.provider)) return false;
  const resources = CREATOR_FIELDS_FILL_RESOURCES[target.provider as keyof typeof CREATOR_FIELDS_FILL_RESOURCES];
  return typeof resources === "string" ? resources === target.resourceType : resources.some(resource => resource === target.resourceType);
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
    if (Number.isInteger(date.year) && isCreatorYear(String(date.year).padStart(4, "0"))) {
      return String(date.year).padStart(4, "0");
    }
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

function comicVineDate(value: JSONValue | undefined, field: "birth" | "death", diagnostics: string[]) {
  if (value == null || value === "") return null;
  if (isCreatorYear(value)) return value;
  // Keep the provider's calendar day even when its datetime includes an offset.
  const date = typeof value === "string"
    ? /^([0-9]{4}-[0-9]{2}-[0-9]{2})(?:[ T](?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]+)?(?:Z|[+-](?:[01][0-9]|2[0-3]):?[0-5][0-9])?)?$/.exec(value)?.[1]
    : undefined;
  if (!isCreatorDate(date)) {
    diagnostics.push(`invalid-${field}`);
    return null;
  }
  // Comic Vine can use January 1 when only the year is known.
  return date.endsWith("-01-01") ? date.slice(0, 4) : date;
}

function igdbStartDate(row: Record<string, JSONValue>, diagnostics: string[]) {
  if (row.start_date == null) return null;
  const reference = row.start_date_format;
  const format = object(reference)?.format;
  const precisionId = reference == null ? row.start_date_category : reference;
  // IGDB /date_formats identifies YYYYMMDD as 0, including in saved company profiles.
  const exact = format == null ? precisionId === 0 : format === "YYYYMMDD";
  const hasYear = typeof format === "string" ? /^YYYY(?:MM|Q[1-4])?$/.test(format)
    : typeof precisionId === "number" && Number.isInteger(precisionId) && precisionId >= 1 && precisionId <= 6;
  if (!exact && !hasYear) {
    diagnostics.push(format === "TBD" || precisionId === 7 ? "partial-start_date" : "unverified-start_date-precision");
    return null;
  }
  if (typeof row.start_date === "number" && Number.isSafeInteger(row.start_date)) {
    const timestamp = new Date(row.start_date * 1000);
    if (!Number.isNaN(timestamp.getTime())) {
      const date = timestamp.toISOString().split("T")[0];
      if (isCreatorDate(date)) return exact ? date : date.slice(0, 4);
    }
  }
  diagnostics.push("invalid-start_date");
  return null;
}

function comicVineFoundingYear(row: Record<string, JSONValue>, name: string, diagnostics: string[]) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const founding = String.raw`(?:was\s+)?(?:founded|established|formed)\s+in\s+([0-9]{4})\b`;
  const namedSubject = new RegExp(String.raw`(?:^|[.!?]\s+)${escapedName}\s+${founding}`, "gi");
  const openingSummary = new RegExp(String.raw`^${escapedName}\s+is\s+(?:an?\s+)?(?:[\w-]+\s+){0,6}(?:publisher|company|press)\s+${founding}`, "i");
  const years = new Set<string>();
  for (const value of [row.deck, row.description]) {
    if (typeof value !== "string") continue;
    const plain = value.replace(/<\/?[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ").trim();
    for (const [, year] of plain.matchAll(namedSubject)) if (isCreatorYear(year)) years.add(year);
    const year = openingSummary.exec(plain)?.[1];
    if (isCreatorYear(year)) years.add(year);
  }
  if (years.size > 1) {
    diagnostics.push("ambiguous-founding-year");
    return null;
  }
  return years.values().next().value ?? null;
}

export function projectCreatorFillDates(target: CreatorProfileTarget, snapshot: Snapshot): DatesProjection {
  if (!supportsCreatorFillDates(target)) throw new Error("UNSUPPORTED_CREATOR_DATES_PROVIDER");
  const descriptorMatches = matchesDescriptor(snapshot, creatorFillDatesDescriptor(target))
    || ((target.provider === "igdb" || target.provider === "comic-vine") && matchesDescriptor(snapshot, creatorProfileDescriptor(target)));
  if (!descriptorMatches) throw new Error("INVALID_CREATOR_SNAPSHOT");
  if (target.provider === "fantlab") {
    const dates = mapFantlabAuthorDates(snapshot);
    return { ...dates, diagnostics: dates.diagnostics.filter(code => code !== "fantlab-profile-not-opened") };
  }
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
  if (target.resourceType === "publisher") return { birthDate: comicVineFoundingYear(row, row.name, diagnostics), deathDate: null, diagnostics };
  const birthDate = comicVineDate(row.birth, "birth", diagnostics);
  const death = object(row.death);
  if (row.death != null && (!death || !("date" in death))) diagnostics.push("invalid-death");
  const deathDate = comicVineDate(death?.date, "death", diagnostics);
  return {
    birthDate,
    deathDate,
    diagnostics,
  };
}
