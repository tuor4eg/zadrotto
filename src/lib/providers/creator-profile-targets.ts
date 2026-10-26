import type { SnapshotDescriptor } from "./types";

export type CreatorProfileTarget = {
  provider: "fantlab" | "tmdb" | "igdb" | "rawg" | "anilist";
  resourceType: "author" | "person" | "company" | "network" | "developer" | "publisher";
  externalId: string;
};
export const CREATOR_PROFILE_KINDS = [
  { provider: "anilist", resourceType: "person", bindingPrefix: "person:" },
  { provider: "fantlab", resourceType: "author", bindingPrefix: "" },
  { provider: "tmdb", resourceType: "person", bindingPrefix: "person:" },
  { provider: "tmdb", resourceType: "company", bindingPrefix: "company:" },
  { provider: "tmdb", resourceType: "network", bindingPrefix: "network:" },
  { provider: "igdb", resourceType: "company", bindingPrefix: "company:" },
  { provider: "rawg", resourceType: "developer", bindingPrefix: "developer:" },
  { provider: "rawg", resourceType: "publisher", bindingPrefix: "publisher:" },
] as const;
export const IGDB_COMPANY_PROFILE_FIELDS = "*,logo.*,websites.*";
export function parseCreatorProfileTarget(value: unknown): CreatorProfileTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_CREATOR_PROFILE_TARGET");
  const row = value as Record<string, unknown>;
  const { provider, resourceType, externalId } = row;
  if (typeof externalId !== "string" || !/^[1-9]\d*$/.test(externalId) || !Number.isSafeInteger(Number(externalId))
    || !CREATOR_PROFILE_KINDS.some(kind => kind.provider === provider && kind.resourceType === resourceType)) throw new Error("INVALID_CREATOR_PROFILE_TARGET");
  return { provider, resourceType, externalId } as CreatorProfileTarget;
}
export function creatorProfileTargetFromBinding(binding: { provider: string; externalCreatorId: string }): CreatorProfileTarget | null {
  const kind = CREATOR_PROFILE_KINDS.find(kind => kind.provider === binding.provider && binding.externalCreatorId.startsWith(kind.bindingPrefix));
  if (!kind) return null;
  try {
    return parseCreatorProfileTarget({ provider: kind.provider, resourceType: kind.resourceType, externalId: binding.externalCreatorId.slice(kind.bindingPrefix.length) });
  } catch { return null; }
}
export function creatorProfileDescriptor(input: CreatorProfileTarget): SnapshotDescriptor {
  const target = parseCreatorProfileTarget(input);
  if (target.provider === "anilist") return { providerCode: "anilist", resourceType: "person", externalId: target.externalId, apiMethod: "staff.image", requestParams: { version: 1 } };
  if (target.provider === "fantlab") return { providerCode: "fantlab", resourceType: "author", externalId: target.externalId, apiMethod: "autor.get", requestParams: { biography: 1, awards: 1 } };
  if (target.provider === "tmdb" && target.resourceType === "person") return { providerCode: "tmdb", resourceType: "person", externalId: target.externalId, apiMethod: "person.details", requestParams: { language: "ru-RU" } };
  return { providerCode: target.provider, resourceType: target.resourceType, externalId: target.externalId,
    apiMethod: target.provider === "igdb" ? "companies" : target.resourceType === "company" ? "companies.get" : `${target.resourceType}s.get`,
    requestParams: target.provider === "igdb" ? { fields: IGDB_COMPANY_PROFILE_FIELDS } : {} };
}
