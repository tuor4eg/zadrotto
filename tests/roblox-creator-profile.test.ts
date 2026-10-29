import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchCreatorProfileRaw } from "@/lib/providers/creator-profile-fetch";
import { creatorProfileTargetFromBinding } from "@/lib/providers/creator-profile-targets";

test("Roblox creator profiles preserve raw thumbnails and map user and group images", async () => {
  for (const resourceType of ["user", "group"] as const) {
    const target = { provider: "roblox" as const, resourceType, externalId: "7" };
    assert.deepEqual(creatorProfileTargetFromBinding({ provider: "roblox", externalCreatorId: `${resourceType}:7` }), target);
    const requests: string[] = [];
    const result = await fetchCreatorProfileRaw(target, {
      signal: new AbortController().signal, credentials: {}, requestStartedAt: async () => new Date(0),
      fetchImpl: async input => {
        const url = new URL(String(input));
        requests.push(url.hostname);
        return Response.json(url.hostname === "thumbnails.roblox.com"
          ? { data: [{ targetId: 7, state: "Completed", imageUrl: "https://tr.rbxcdn.com/image" }] }
          : { id: 7, name: "Owner" });
      },
    });
    assert.deepEqual(requests, [resourceType === "user" ? "users.roblox.com" : "groups.roblox.com", "thumbnails.roblox.com"]);
    assert.ok(result.payload && typeof result.payload === "object" && !Array.isArray(result.payload) && result.payload.imageUrl === "https://tr.rbxcdn.com/image");
    assert.ok(result.payload && typeof result.payload === "object" && !Array.isArray(result.payload) && result.payload.thumbnail);
  }
});
