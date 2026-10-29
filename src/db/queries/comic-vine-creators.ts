import { and, eq, inArray, sql } from "drizzle-orm";
import { creatorRoles, creatorRequests, creatorRequestMediaItems, entryCreators, entryCreatorSources, providerCreatorBindings, providerCreatorExclusions } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { ComicVineCreatorReference } from "@/lib/providers/comic-vine-adapter";
import { enqueueCreatorAutoApproval } from "./creator-auto-approval-jobs";
import { pruneEntryCreators, type CreatorTransaction } from "./creators";

/** A missing issue roster leaves person provenance untouched. Caller locks the entry. */
export async function syncComicVineCreators(tx: CreatorTransaction, entryId: number, publisher: ComicVineCreatorReference[], people: ComicVineCreatorReference[] | null, enqueueApproval = true) {
  const refs = [...publisher, ...(people ?? [])];
  const roles = new Map((await tx.select().from(creatorRoles).where(inArray(creatorRoles.code, ["publisher", "screenwriter", "artist"]))).map(role => [role.code, role.id]));
  if (refs.some(ref => !roles.has(ref.roleCode) || !normalizeSearchText(ref.name))) throw new Error("INVALID_COMIC_VINE_CREATORS");
  const groups = new Map<string, ComicVineCreatorReference[]>();
  for (const ref of refs) groups.set(ref.externalId, [...(groups.get(ref.externalId) ?? []), ref]);
  const requests: { request: typeof creatorRequests.$inferSelect; refs: ComicVineCreatorReference[]; detected: boolean }[] = [];
  for (const [externalId, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const [created] = await tx.insert(creatorRequests).values({ provider: "comic-vine", mediaType: "comic", externalCreatorId: externalId, externalCreatorName: group[0].name, normalizedExternalCreatorName: normalizeSearchText(group[0].name) }).onConflictDoNothing().returning();
    const [request] = await tx.select().from(creatorRequests).where(and(eq(creatorRequests.provider, "comic-vine"), eq(creatorRequests.externalCreatorId, externalId))).for("update");
    requests.push({ request, refs: group, detected: Boolean(created) });
  }
  const owned = people === null ? sql`${entryCreatorSources.normalizedExternalCreatorName} like 'comic-vine:publisher:%'` : undefined;
  await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId, entryId), eq(entryCreatorSources.provider, "comic-vine"), owned));
  await tx.delete(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.mediaItemId, entryId), sql`${creatorRequestMediaItems.requestId} in (select id from creator_requests where provider = 'comic-vine' ${people === null ? sql`and external_creator_id like 'publisher:%'` : sql``})`));
  for (const { request, refs: group, detected } of requests) {
    const externalId = request.externalCreatorId!;
    await tx.insert(creatorRequestMediaItems).values(group.map(ref => ({ requestId: request.id, mediaItemId: entryId, roleId: roles.get(ref.roleCode)!, externalCreatorName: ref.name, sourcePosition: ref.position }))).onConflictDoNothing();
    await tx.update(creatorRequests).set({ externalCreatorName: group[0].name, normalizedExternalCreatorName: normalizeSearchText(group[0].name), lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
    const [excluded] = await tx.select().from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, "comic-vine"), eq(providerCreatorExclusions.externalCreatorId, externalId)));
    const [binding] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "comic-vine"), eq(providerCreatorBindings.externalCreatorId, externalId), eq(providerCreatorBindings.active, true)));
    if (binding && !excluded && request.decision !== "exclude" && !(request.decision === null && request.manuallyReopened)) {
      if (request.decision === null) await tx.update(creatorRequests).set({ decision: "map", resolvedAt: new Date(), applyStatus: "processed", updatedAt: new Date() }).where(eq(creatorRequests.id, request.id));
      for (const ref of group) {
        const roleId = roles.get(ref.roleCode)!;
        await tx.insert(entryCreators).values({ entryId, creatorId: binding.creatorId, roleId }).onConflictDoNothing();
        await tx.insert(entryCreatorSources).values({ entryId, creatorId: binding.creatorId, roleId, provider: "comic-vine", bindingId: binding.id, normalizedExternalCreatorName: `comic-vine:${externalId}`, sourcePosition: ref.position }).onConflictDoNothing();
      }
    } else if (detected && !excluded && enqueueApproval) await enqueueCreatorAutoApproval(tx, [request.id]);
  }
  await pruneEntryCreators(tx, entryId);
}
