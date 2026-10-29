import { and, eq, sql } from "drizzle-orm";
import { creators, creatorTypes, creatorRoles, creatorRequests, creatorRequestMediaItems, entryCreators, entryCreatorSources, providerCreatorBindings, providerCreatorExclusions } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { normalizeRobloxSnapshot } from "@/lib/providers/roblox-adapter";
import { enqueueCreatorAutoApproval } from "./creator-auto-approval-jobs";
import { pruneEntryCreators, type CreatorTransaction } from "./creators";

/** Caller locks the entry. The shared request lock serializes the provider identity. */
export async function syncRobloxCreator(tx: CreatorTransaction, entryId: number, owner: ReturnType<typeof normalizeRobloxSnapshot>["creator"], enqueueApproval = true) {
  const normalizedName = normalizeSearchText(owner.name);
  if (!normalizedName) throw new Error("INVALID_ROBLOX_CREATOR");
  const [role] = await tx.select({ id: creatorRoles.id }).from(creatorRoles).where(eq(creatorRoles.code, "developer"));
  if (!role) throw new Error("ROBLOX_CREATOR_ROLE_MISSING");
  const [created] = await tx.insert(creatorRequests).values({ provider: "roblox", mediaType: "roblox", externalCreatorId: owner.externalId,
    externalCreatorName: owner.name, normalizedExternalCreatorName: normalizedName }).onConflictDoNothing().returning();
  const [request] = await tx.select().from(creatorRequests).where(and(eq(creatorRequests.provider, "roblox"), eq(creatorRequests.externalCreatorId, owner.externalId))).for("update");
  await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId, entryId), eq(entryCreatorSources.provider, "roblox")));
  await tx.delete(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.mediaItemId, entryId), sql`${creatorRequestMediaItems.requestId} in (select id from creator_requests where provider='roblox')`));
  await tx.insert(creatorRequestMediaItems).values({ requestId: request.id, mediaItemId: entryId, roleId: role.id, externalCreatorName: owner.name }).onConflictDoNothing();
  await tx.update(creatorRequests).set({ externalCreatorName: owner.name, normalizedExternalCreatorName: normalizedName, lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
  const [excluded] = await tx.select({ id: providerCreatorExclusions.id }).from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, "roblox"), eq(providerCreatorExclusions.externalCreatorId, owner.externalId)));
  const [binding] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "roblox"), eq(providerCreatorBindings.externalCreatorId, owner.externalId), eq(providerCreatorBindings.active, true)));
  if (binding && !excluded && request.decision !== "exclude" && !(request.decision === null && request.manuallyReopened)) {
    const [bound] = await tx.select({ type: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, binding.creatorId));
    if (bound?.type !== (owner.type === "company" ? "organization" : "person")) throw new Error("ROBLOX_CREATOR_TYPE_MISMATCH");
    await tx.update(providerCreatorBindings).set({ externalCreatorName: owner.name, updatedAt: new Date() }).where(eq(providerCreatorBindings.id, binding.id));
    if (request.decision === null) await tx.update(creatorRequests).set({ decision: "map", resolvedAt: new Date(), applyStatus: "processed", updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
    await tx.insert(entryCreators).values({ entryId, creatorId: binding.creatorId, roleId: role.id }).onConflictDoNothing();
    await tx.insert(entryCreatorSources).values({ entryId, creatorId: binding.creatorId, roleId: role.id, provider: "roblox", bindingId: binding.id, normalizedExternalCreatorName: `roblox:${owner.externalId}` }).onConflictDoNothing();
  } else if (created && !excluded && enqueueApproval) await enqueueCreatorAutoApproval(tx, [request.id]);
  await pruneEntryCreators(tx, entryId);
}
