import { extractBggCreatorReferences } from "@/lib/media/creators";
import { parseBggItem, parseBggXml } from "./bgg-xml";
import type { RawSnapshot, SnapshotDescriptor } from "./types";

export const BGG_LEGACY_FACT_KEYS = ["genres", "genreReferences", "authors", "artists", "bggCreators"] as const;
export const BGG_FACT_KEYS = ["mechanics", "publishers", "bggItemType", "minPlayers", "maxPlayers", "runtimeMinutes", "minPlayingTimeMinutes", "maxPlayingTimeMinutes", "minAge"] as const;

export function describeBggSource(externalId: string): SnapshotDescriptor {
  if (!/^[1-9]\d*$/.test(externalId) || !Number.isSafeInteger(Number(externalId))) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { providerCode: "bgg", resourceType: "boardgame", externalId, apiMethod: "thing.details", requestParams: { version: 1, type: "boardgame,boardgameexpansion" } };
}

/** The complete XML remains the stored evidence; arrays below are transient domain input. */
export function normalizeBggSnapshot(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  describeBggSource(snapshot.externalId);
  if (snapshot.providerCode !== "bgg" || typeof snapshot.payload !== "string") throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const nodes = parseBggXml(snapshot.payload);
  if (nodes.length !== 1) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const rawLinks = nodes[0].link;
  const links = rawLinks === undefined ? [] : Array.isArray(rawLinks) ? rawLinks : [rawLinks];
  for (const value of links) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    const link = value as Record<string, unknown>;
    if (typeof link["@_type"] !== "string" || !link["@_type"].trim()) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    if (["boardgamecategory", "boardgamemechanic", "boardgamepublisher"].includes(link["@_type"]) && (typeof link["@_value"] !== "string" || !link["@_value"].trim())) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    if (link["@_type"] === "boardgamecategory" && (typeof link["@_id"] !== "string" || !/^[1-9]\d*$/.test(link["@_id"]) || !Number.isSafeInteger(Number(link["@_id"])))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  }
  const item = parseBggItem(nodes[0], true);
  if (item.id !== snapshot.externalId) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const creatorReferences = extractBggCreatorReferences(item.facts)!.map(({ externalId, name, roleCode }) => ({ externalId, name, roleCode }));
  const facts: Record<string, unknown> = Object.fromEntries(BGG_FACT_KEYS.map(key => [key, item.facts[key]]).filter(([, value]) => value !== null && value !== undefined && (typeof value !== "string" || value.trim()) && (!Array.isArray(value) || value.length > 0)));
  return { provider: "bgg" as const, externalId: item.id, sourceUrl: `https://boardgamegeek.com/boardgame/${item.id}`, facts,
    genreFacts: { genres: item.facts.genres as string[], genreReferences: item.facts.genreReferences as Array<{ id: string; name: string }> }, creatorReferences,
    fields: { title: item.title, originalTitle: item.title, description: item.description, releaseYear: item.year,
      aliases: item.alternateNames.filter(name => /[\u0400-\u04ff]/u.test(name)) } };
}

export function bggProjectionLegacyFacts(projection: ReturnType<typeof normalizeBggSnapshot>): Record<string, unknown> {
  return { ...projection.facts, ...projection.genreFacts, bggCreators: projection.creatorReferences,
    authors: [...new Set(projection.creatorReferences.filter(row => row.roleCode === "designer").map(row => row.name))],
    artists: [...new Set(projection.creatorReferences.filter(row => row.roleCode === "artist").map(row => row.name))] };
}
