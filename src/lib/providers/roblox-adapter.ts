import type { RawSnapshot, SnapshotDescriptor } from "./types";

export const ROBLOX_LEGACY_FACT_KEYS = [
  "universeId", "rootPlaceId", "creatorId", "creatorName", "creatorType",
  "createdAt", "updatedAt", "genre", "genreLevel1", "genreLevel2",
] as const;

export function describeRobloxSource(externalId: string): SnapshotDescriptor {
  if (!/^[1-9]\d*$/.test(externalId) || !Number.isSafeInteger(Number(externalId))) {
    throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  }
  return { providerCode: "roblox", resourceType: "game", externalId, apiMethod: "game.details", requestParams: { version: 1 } };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** New snapshots retain complete API responses; older snapshots stored a single game. */
export function normalizeRobloxSnapshot(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  describeRobloxSource(snapshot.externalId);
  const payload = record(snapshot.payload);
  const games = record(payload?.games);
  const game = Array.isArray(games?.data)
    ? record(games.data.find(value => record(value)?.id === Number(snapshot.externalId)))
    : record(payload?.game);
  if (snapshot.providerCode !== "roblox" || !game || game.id !== Number(snapshot.externalId)) {
    throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  }
  const creator = record(game.creator);
  if (!positiveInteger(game.rootPlaceId) || typeof game.name !== "string" || !game.name.trim()
    || !creator || !positiveInteger(creator.id) || typeof creator.name !== "string" || !creator.name.trim()
    || (creator.type !== "User" && creator.type !== "Group")) {
    throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  }
  const year = typeof game.created === "string" && /^\d{4}-\d{2}-\d{2}T/.test(game.created)
    && !Number.isNaN(Date.parse(game.created)) ? Number(game.created.slice(0, 4)) : null;
  const facts: Record<string, unknown> = {};
  if (positiveInteger(game.maxPlayers)) facts.maxPlayers = game.maxPlayers;
  if (typeof game.price === "number" && Number.isFinite(game.price) && game.price > 0) facts.paidAccess = true;
  if (typeof game.createVipServersAllowed === "boolean") facts.privateServers = game.createVipServersAllowed;
  const type = creator.type === "User" ? "person" : "company";
  return {
    provider: "roblox" as const,
    externalId: snapshot.externalId,
    sourceUrl: `https://www.roblox.com/games/${game.rootPlaceId}`,
    fields: { title: game.name.trim(), ...(year ? { releaseYear: year } : {}),
      ...(typeof game.description === "string" && game.description.trim() ? { description: game.description.trim() } : {}) },
    facts,
    creator: { externalId: `${creator.type.toLowerCase()}:${creator.id}`, name: creator.name.trim(), type, roleCode: "developer" as const },
  };
}
