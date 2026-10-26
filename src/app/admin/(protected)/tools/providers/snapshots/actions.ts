"use server";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { enqueueJobRun } from "@/lib/jobs/queue";
import { PROVIDER_SNAPSHOT_JOB_TYPE, parseSnapshotJobPayload } from "@/lib/providers/snapshot-job";
export async function enqueueProviderSnapshotAction(form: FormData) {
  const admin=await requireAdminUser();
  const creator = form.get("entityType") === "creator";
  const id=String(form.get(creator ? "creatorId" : "mediaItemId")??"");
  const recordPath = creator ? "/admin/creators" : "/admin/media";
  let runId:number;
  try {
    const provider=String(form.get("provider")??"");
    const rawCreatorIds = String(form.get("creatorIds") ?? "").trim();
    const creatorIds = rawCreatorIds ? rawCreatorIds.split(/[\s,]+/).map(value => /^\d+$/.test(value) ? Number(value) : NaN) : undefined;
    const standalone = form.get("profileTarget") === "on";
    const payload=parseSnapshotJobPayload({
      ...(!creator && !standalone && ["book", "film", "series", "anime"].includes(String(form.get("mediaType") ?? form.get("processingType"))) ? {mediaType:String(form.get("mediaType") ?? form.get("processingType"))} : {}),
      operation:String(form.get("operation")??"verify"),
      ...(form.get("batchSize")?{batchSize:Number(form.get("batchSize"))}:{}),
      ...(form.get("batchPauseHours")?{batchPauseHours:Number(form.get("batchPauseHours"))}:{}),
      ...(standalone ? {profileTargets:[{provider,resourceType:String(form.get("resourceType")??""),externalId:String(form.get("externalId")??"").trim()}]} : provider?{provider}:{}),
      ...(form.get("onlyMissingSnapshots") === "on" ? { onlyMissingSnapshots: true } : {}),
      ...(standalone ? {} : creator ? { entityType: "creator", ...(id ? {creatorIds:[Number(id)]} : creatorIds ? {creatorIds} : {}) } : (id ? {mediaItemIds:[Number(id)]} : {})),
      ...(form.get("bindingId") ? {bindingIds:[Number(form.get("bindingId"))]} : {}),
      ...(form.get("afterId")?{afterId:Number(form.get("afterId"))}:{}),
      ...(form.get("throughId")?{throughId:Number(form.get("throughId"))}:{})});
    const run=await enqueueJobRun({type:PROVIDER_SNAPSHOT_JOB_TYPE,payload,source:"manual",createdByAdminId:admin.id});
    runId=run.id;
  } catch {
    if (Number.isSafeInteger(Number(id)) && Number(id) > 0) redirect(`${recordPath}/${Number(id)}/snapshots?error=enqueue`);
    redirect("/admin/tools/providers/snapshots?error=invalid");
  }
  if (id) redirect(`${recordPath}/${Number(id)}/snapshots?run=${runId}`);
  redirect(`/admin/tools/providers/snapshots?run=${runId}`);
}

export async function attachCreatorProfileSnapshotAction(form: FormData) {
  await requireAdminUser();
  const creatorId = Number(form.get("creatorId"));
  if (!Number.isSafeInteger(creatorId) || creatorId < 1) redirect("/admin/tools/providers/snapshots?error=invalid");
  try {
    const { attachCreatorProfileSnapshot } = await import("@/db/queries/creator-profile-snapshots");
    const ref = { id: Number(form.get("snapshotId")), payloadHash: String(form.get("payloadHash") ?? "") };
    let bindingId = Number(form.get("bindingId"));
    if (!bindingId) {
      const { getCreatorProfileSources } = await import("@/db/queries/creator-profile-snapshots");
      const state = await getCreatorProfileSources(creatorId);
      bindingId = state?.sources.find(source => source.snapshot?.id === ref.id && source.snapshot.payloadHash === ref.payloadHash)?.binding.id ?? 0;
    }
    if (!Number.isSafeInteger(bindingId) || bindingId < 1) throw new Error("CREATOR_BINDING_MISSING");
    await attachCreatorProfileSnapshot({ creatorId, bindingId, ref });
  } catch {
    redirect(`/admin/creators/${creatorId}/snapshots?error=attach`);
  }
  redirect(`/admin/creators/${creatorId}/snapshots`);
}

export async function enqueueTmdbPersonAvatarAction(form: FormData) {
  const admin = await requireAdminUser();
  const creatorId = Number(form.get("creatorId"));
  if (!Number.isSafeInteger(creatorId) || creatorId < 1) redirect("/admin/tools/providers/snapshots?error=invalid");
  let runId: number;
  try {
    const { getCreatorProfileSources } = await import("@/db/queries/creator-profile-snapshots");
    const sources = await getCreatorProfileSources(creatorId);
    if (sources?.creator.typeCode !== "person" || sources.sources.filter(source => source.binding.id === Number(form.get("bindingId")) && source.target?.provider === "tmdb" && source.target.resourceType === "person").length !== 1) throw new Error("CREATOR_BINDING_MISSING");
    runId = (await enqueueJobRun({ type: "media.creator-image-refresh", payload: { creatorId, bindingId: Number(form.get("bindingId")) }, source: "manual", createdByAdminId: admin.id })).id;
  } catch { redirect(`/admin/creators/${creatorId}/snapshots?error=enqueue`); }
  redirect(`/admin/tools/jobs/journal?job=adhoc#run-${runId}`);
}
