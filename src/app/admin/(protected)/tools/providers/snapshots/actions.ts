"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { enqueueJobRun } from "@/lib/jobs/queue";
import { PROVIDER_SNAPSHOT_JOB_TYPE, parseSnapshotJobPayload } from "@/lib/providers/snapshot-job";
import { enableNormalizedBookProvider } from "@/lib/providers/book-cutover";
import type { BookCutoverReport } from "@/lib/providers/book-cutover-check";

export type BookCutoverState = { enabled?: boolean; error?: string; report?: BookCutoverReport };

export async function enableBookProviderAction(_state: BookCutoverState, form: FormData): Promise<BookCutoverState> {
  const admin = await requireAdminUser();
  try {
    const result = await enableNormalizedBookProvider(String(form.get("provider") ?? ""), admin.id);
    if (!result.enabled) return { error: "Переключение заблокировано: сначала устраните расхождения.", report: result.report };
    revalidatePath("/", "layout");
    return { enabled: true };
  } catch {
    return { error: "Не удалось проверить и переключить провайдера. Повторите попытку." };
  }
}

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
    const payload=parseSnapshotJobPayload({operation:String(form.get("operation")??"verify"),
      ...(form.get("batchSize")?{batchSize:Number(form.get("batchSize"))}:{}),
      ...(form.get("batchPauseHours")?{batchPauseHours:Number(form.get("batchPauseHours"))}:{}),
      ...(provider?{provider}:{}),
      ...(creator && form.get("onlyMissingSnapshots") === "on" ? { onlyMissingSnapshots: true } : {}),
      ...(creator ? { entityType: "creator", ...(id ? {creatorIds:[Number(id)]} : creatorIds ? {creatorIds} : {}) } : (id ? {mediaItemIds:[Number(id)]} : {})),
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
