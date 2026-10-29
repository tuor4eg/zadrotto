import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeRobloxSource, normalizeRobloxSnapshot } from "@/lib/providers/roblox-adapter";

const game = { id: 123, rootPlaceId: 456, name: " Example ", description: " Game ",
  created: "2020-01-02T00:00:00Z", creator: { id: 7, type: "User", name: " Player " },
  maxPlayers: 12, price: 25, createVipServersAllowed: false, visits: 100, playing: 50 };
const normalize = (value: Record<string, unknown>) => normalizeRobloxSnapshot({ providerCode: "roblox", externalId: "123", payload: { game: value } });

describe("Roblox snapshot normalization", () => {
  it("extracts structured data without popularity statistics", () => {
    assert.deepEqual(normalize(game), { provider: "roblox", externalId: "123", sourceUrl: "https://www.roblox.com/games/456",
      fields: { title: "Example", releaseYear: 2020, description: "Game" },
      facts: { maxPlayers: 12, paidAccess: true, privateServers: false },
      creator: { externalId: "user:7", name: "Player", type: "person", roleCode: "developer" } });
  });
  it("distinguishes owner types and omits unavailable or free characteristics", () => {
    const result = normalize({ ...game, creator: { id: 7, type: "Group", name: "Team" }, price: 0, maxPlayers: null, createVipServersAllowed: null });
    assert.deepEqual(result.creator, { externalId: "group:7", name: "Team", type: "company", roleCode: "developer" });
    assert.deepEqual(result.facts, {});
  });
  it("rejects mismatched identities and incomplete owners", () => {
    assert.throws(() => describeRobloxSource("01"));
    assert.throws(() => normalize({ ...game, id: 999 }));
    assert.throws(() => normalize({ ...game, creator: { id: 7, type: "Other", name: "X" } }));
  });
  it("normalizes the complete response envelope and accepts earlier snapshots", () => {
    const snapshot = { providerCode: "roblox", externalId: "123", payload: { games: { data: [game], extra: "preserved" } } } as const;
    assert.deepEqual(normalizeRobloxSnapshot(snapshot), normalize(game));
  });
});
