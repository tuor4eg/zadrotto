"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assignManualCreatorAvatar, clearCreatorAvatar, assignFantlabCreatorBinding, replaceCreatorFantlabBinding, getCreatorAvatarState } from "@/db/queries/creator-avatars";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { logActivity } from "@/lib/activity-logs/server";
import { parseAvatarCrop } from "@/lib/avatars/storage";
import { uploadCreatorAvatar, deleteCreatorAvatarBestEffort } from "@/lib/creators/avatar-storage";
import { getFantlabAuthor } from "@/lib/creators/fantlab-api";
import { canWriteCreatorImage } from "@/lib/creators/image-policy";
import { enqueueJobRun } from "@/lib/jobs/queue";

function id(value: FormDataEntryValue | null) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("invalid-id");
  return number;
}
function finish(creatorId: number, status: string): never {
  revalidatePath("/", "layout");
  redirect(`/admin/creators/${creatorId}/edit?${status}`);
}

export async function updateCreatorAvatarAction(form: FormData) {
  const admin = await requireAdminUser();
  const creatorId = id(form.get("creatorId"));
  if (!await getCreatorAvatarState(creatorId)) finish(creatorId, "avatarError=save");
  const file = form.get("avatarFile");
  const crop = parseAvatarCrop({ x: form.get("cropX"), y: form.get("cropY"), width: form.get("cropWidth"), height: form.get("cropHeight") });
  if (!(file instanceof File) || !crop) finish(creatorId, "avatarError=invalid");
  const uploaded = await uploadCreatorAvatar({ creatorId, file, crop });
  if (!uploaded.ok) finish(creatorId, `avatarError=${uploaded.error}`);
  try {
    const previousObjectKey = await assignManualCreatorAvatar(creatorId, uploaded);
    await deleteCreatorAvatarBestEffort(previousObjectKey);
  } catch {
    await deleteCreatorAvatarBestEffort(uploaded.objectKey);
    finish(creatorId, "avatarError=save");
  }
  await logActivity({ action: "creator.updated", actorType: "admin", adminUserId: admin.id, entityType: "creator", entityId: creatorId, message: "Обновлён ручной аватар создателя." });
  finish(creatorId, "avatarUpdated=1");
}

export async function removeCreatorAvatarAction(form: FormData) {
  const admin = await requireAdminUser();
  const creatorId = id(form.get("creatorId"));
  try {
    const previousObjectKey = await clearCreatorAvatar(creatorId);
    await deleteCreatorAvatarBestEffort(previousObjectKey);
  } catch { finish(creatorId, "avatarError=save"); }
  await logActivity({ action: "creator.updated", actorType: "admin", adminUserId: admin.id, entityType: "creator", entityId: creatorId, message: "Удалён аватар создателя." });
  finish(creatorId, "avatarUpdated=1");
}

export async function assignCreatorFantlabBindingAction(form: FormData) {
  await requireAdminUser();
  const creatorId = id(form.get("creatorId"));
  let authorName = "";
  try {
    const externalCreatorId = String(id(form.get("externalCreatorId")));
    const author = await getFantlabAuthor(externalCreatorId);
    if (String(author.id) !== externalCreatorId) throw new Error("invalid-author");
    authorName = author.name;
    if (form.get("allVariants") === "1") await replaceCreatorFantlabBinding({ creatorId, externalCreatorId });
    else await assignFantlabCreatorBinding({ creatorId, externalCreatorId, ...(form.get("mappingId") ? { mappingId: id(form.get("mappingId")) } : {}) });
  } catch { finish(creatorId, "avatarError=binding"); }
  finish(creatorId, `avatarUpdated=1&fantlabAuthor=${encodeURIComponent(authorName)}`);
}

export async function refreshCreatorImageAction(form: FormData) {
  const admin = await requireAdminUser();
  const creatorId = id(form.get("creatorId"));
  let runId: number;
  try {
    const bindingId = id(form.get("bindingId"));
    const { getCreatorProfileSources } = await import("@/db/queries/creator-profile-snapshots");
    const state = await getCreatorProfileSources(creatorId);
    const source = state?.sources.find(source => source.binding.id === bindingId && source.target);
    if (!source || !state || !((state.creator.typeCode === "person" && (source.target?.provider === "fantlab" || source.target?.resourceType === "person")) || (state.creator.typeCode === "organization" && (source.target?.resourceType === "company" || source.target?.resourceType === "network")))) throw new Error("CREATOR_BINDING_MISSING");
    const avatar = await getCreatorAvatarState(creatorId);
    if (!avatar || !canWriteCreatorImage(avatar, source.binding)) throw new Error("image-protected");
    runId = (await enqueueJobRun({ createdByAdminId: admin.id, type: "media.creator-image-refresh", source: "manual", payload: { creatorId, bindingId } })).id;
  } catch (error) { finish(creatorId, error instanceof Error && error.message === "image-protected" ? "avatarError=protected" : "avatarError=queue"); }
  finish(creatorId, `avatarQueued=1&imageRun=${runId}`);
}
