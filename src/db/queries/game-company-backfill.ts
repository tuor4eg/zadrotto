import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameCompanyBackfills as operations, gameCompanyBackfillItems as items, jobRuns, mediaItemMetadata as metadata, mediaItemProviderSnapshots as snapshots, gameCompanyRosters } from "@/db/schema";
import { getMediaItemProviderSnapshotHash } from "@/db/queries/media-item-provider-snapshots";
import type { GameCompanyReference } from "@/lib/creators/game-companies";

export const GAME_COMPANY_BACKFILL_TYPE = "media.game-companies-backfill";
export async function claimGameCompanyBackfill(runId: number, adminId: number | null = null, jobGuard?: SnapshotJobGuard) {
  return withSnapshotJobGuard(jobGuard, async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(72018421)`);
    let [operation] = await tx.select().from(operations).where(inArray(operations.status, ["active", "partial"])).orderBy(desc(operations.id)).limit(1);
    if (operation?.jobRunId && operation.jobRunId !== runId) {
      const [run] = await tx.select({ status: jobRuns.status }).from(jobRuns).where(eq(jobRuns.id, operation.jobRunId));
      if (run && ["queued", "running"].includes(run.status)) return null;
    }
    if (!operation) {
      const [run] = await tx.select({adminId:jobRuns.createdByAdminId}).from(jobRuns).where(eq(jobRuns.id,runId));
      [operation] = await tx.insert(operations).values({ createdByAdminId: adminId ?? run?.adminId, jobRunId: runId }).returning();
      // Metadata is the preferred identity when both sources name the same provider.
      await tx.execute(sql`insert into game_company_backfill_items (backfill_id,media_item_id,provider,source_external_id)
        select ${operation.id}, x.media_item_id, x.provider, x.external_id from (
          select distinct on (media_item_id,provider) media_item_id,provider,external_id from (
            select m.media_item_id,m.source_provider provider,m.source_external_id external_id,0 priority from media_item_metadata m
            union all select s.media_item_id,s.provider_code,s.external_id,1 from media_item_provider_snapshots s
          ) sources where provider in ('igdb','rawg') and external_id ~ '^[1-9][0-9]*$' order by media_item_id,provider,priority
        ) x join media_items mi on mi.id=x.media_item_id where mi.media_type='game' on conflict do nothing`);
    } else if (operation.jobRunId !== runId) {
      await tx.update(operations).set({ status: "active", jobRunId: runId, finishedAt: null, updatedAt: new Date() }).where(eq(operations.id, operation.id));
      await tx.update(items).set({ status: sql`case when ${items.references} is null then 'pending' else 'ready' end`, attempts: 0, error: null }).where(and(eq(items.backfillId, operation.id), eq(items.status, "error")));
    }
    return operation.id;
  });
}
export async function getGameCompanyBackfillBatch(backfillId: number) {
  return db.select().from(items).where(and(eq(items.backfillId, backfillId), inArray(items.status, ["pending", "ready"]))).orderBy(items.mediaItemId).limit(50);
}
export async function checkpointGameCompanyItem(item: typeof items.$inferSelect, patch: Partial<typeof items.$inferInsert>, executor?: Parameters<Parameters<typeof db.transaction>[0]>[0], jobGuard?: SnapshotJobGuard) {
  const write = async (tx: Pick<typeof db, "update">) => {
    await tx.update(items).set({ ...patch, updatedAt: new Date() }).where(and(eq(items.backfillId, item.backfillId), eq(items.mediaItemId, item.mediaItemId), eq(items.provider, item.provider)));
  };
  // A provided transaction is already fenced by its caller; never reacquire its run lock.
  if (executor) return write(executor);
  return withSnapshotJobGuard(jobGuard, write);
}
export async function isCurrentGameCompanySource(item: typeof items.$inferSelect) {
  const [m, s] = await Promise.all([
    db.select({id: metadata.mediaItemId}).from(metadata).where(and(eq(metadata.mediaItemId,item.mediaItemId),eq(metadata.sourceProvider,item.provider),eq(metadata.sourceExternalId,item.sourceExternalId))).limit(1),
    db.select({id:snapshots.mediaItemId}).from(snapshots).where(and(eq(snapshots.mediaItemId,item.mediaItemId),eq(snapshots.providerCode,item.provider),eq(snapshots.externalId,item.sourceExternalId))).limit(1),
  ]);
  return Boolean(m.length || s.length);
}
export async function getCachedGameCompanyRoster(item: typeof items.$inferSelect) {
  const [roster] = await db.select().from(gameCompanyRosters).where(and(eq(gameCompanyRosters.mediaItemId,item.mediaItemId),eq(gameCompanyRosters.provider,item.provider),eq(gameCompanyRosters.sourceExternalId,item.sourceExternalId))).limit(1);
  return roster?.references;
}
export async function mergeGameCompanyMetadata(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], item: typeof items.$inferSelect, references: GameCompanyReference[]) {
  const facts = { gameCompanyReferences: references, developers: [...new Set(references.filter(r=>r.roleCode==='developer').map(r=>r.name))], publishers: [...new Set(references.filter(r=>r.roleCode==='publisher').map(r=>r.name))] };
  await tx.update(metadata).set({facts:sql`${metadata.facts} || ${JSON.stringify(facts)}::jsonb`,updatedAt:new Date()}).where(and(eq(metadata.mediaItemId,item.mediaItemId),eq(metadata.sourceProvider,item.provider),eq(metadata.sourceExternalId,item.sourceExternalId)));
  const [snapshot] = await tx.select().from(snapshots).where(and(eq(snapshots.mediaItemId,item.mediaItemId),eq(snapshots.providerCode,item.provider),eq(snapshots.externalId,item.sourceExternalId))).for("update");
  if (snapshot) {
    const mergedFacts = {...snapshot.facts,...facts};
    const payload = {mediaItemId:snapshot.mediaItemId,providerCode:snapshot.providerCode,externalId:snapshot.externalId,mediaType:snapshot.mediaType,title:snapshot.title,originalTitle:snapshot.originalTitle,description:snapshot.description,releaseYear:snapshot.releaseYear,sourceUrl:snapshot.sourceUrl,facts:mergedFacts};
    await tx.update(snapshots).set({facts:mergedFacts,payloadHash:getMediaItemProviderSnapshotHash(payload),updatedAt:new Date()}).where(eq(snapshots.mediaItemId,item.mediaItemId));
  }
}
export async function finishGameCompanyBackfill(id: number, jobGuard?: SnapshotJobGuard) {
  return withSnapshotJobGuard(jobGuard, async tx => {
    const [counts] = await tx.select({ errors: sql<number>`count(*) filter (where ${items.status}='error')::int` }).from(items).where(eq(items.backfillId,id));
    await tx.update(operations).set({ status: counts.errors ? "partial" : "completed", finishedAt:new Date(),updatedAt:new Date() }).where(eq(operations.id,id));
  });
}
export async function getGameCompanyBackfillProgress(backfillId?: number) {
  const [operation] = await db.select().from(operations).where(backfillId ? eq(operations.id, backfillId) : undefined).orderBy(desc(operations.id)).limit(1);
  if (!operation) return null;
  const [counts] = await db.execute<{total:number;done:number;errors:number;skipped:number;usedBindings:number;newRequests:number}>(sql`
    select count(*)::int total,
      count(*) filter(where all_complete and has_done)::int done,
      count(*) filter(where has_error)::int errors,
      count(*) filter(where all_skipped)::int skipped,
      coalesce(sum(bindings),0)::int "usedBindings",coalesce(sum(requests),0)::int "newRequests"
    from (select media_item_id,bool_and(status in ('done','skipped')) all_complete,
      bool_or(status='done') has_done,bool_or(status='error') has_error,bool_and(status='skipped') all_skipped,
      sum(used_bindings) bindings,sum(new_requests) requests
      from game_company_backfill_items where backfill_id=${operation.id} group by media_item_id) progress`);

  const profiles = await db.execute<{identities:number;images:number}>(sql`select count(*)::int identities,count(*) filter(where p.image_status='ready')::int images from game_company_profiles p where exists (select 1 from game_company_backfill_items i cross join lateral jsonb_array_elements(coalesce(i.references,'[]'::jsonb)) r where i.backfill_id=${operation.id} and i.provider=p.provider and r->>'externalId'=p.external_id)`);
  const issues = await db.select({mediaItemId:items.mediaItemId,provider:items.provider,sourceExternalId:items.sourceExternalId,status:items.status,error:items.error}).from(items).where(and(eq(items.backfillId,operation.id),inArray(items.status,["error","skipped"]))).orderBy(items.mediaItemId).limit(20);
  return {...operation,...counts,identities:profiles[0]?.identities??0,images:profiles[0]?.images??0,issues};
}
