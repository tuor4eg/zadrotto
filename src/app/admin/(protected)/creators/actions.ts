"use server";

import { isCreatorRequestErrorCode } from "../creator-requests/messages";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as creators from "@/db/queries/creators";
import * as requests from "@/db/queries/creator-requests";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parseCreatorDate } from "@/lib/creators/life-dates";
import { deleteCreatorAvatarBestEffort } from "@/lib/creators/avatar-storage";

function id(value: FormDataEntryValue | null) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new Error("invalid-id");
  return result;
}
function text(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 200) throw new Error("invalid-name");
  return value.trim();
}
function refresh() { revalidatePath("/", "layout"); }

export async function searchCreatorRelationsAction(query: string, creatorId?: number) {
  await requireAdminUser();
  if (typeof query !== "string" || query.length > 200 || (creatorId !== undefined && (!Number.isSafeInteger(creatorId) || creatorId < 1))) throw new Error("invalid-search");
  const { findCreatorRelationCandidates } = await import("@/db/queries/creator-editor");
  return findCreatorRelationCandidates(query, creatorId);
}

export async function findCreatorRelatedSeriesAction(creatorId: number) {
  await requireAdminUser();
  if (!Number.isSafeInteger(creatorId) || creatorId < 1) throw new Error("invalid-id");
  return creators.getCreatorRelatedSeriesIds(creatorId);
}

export async function saveCreatorAction(formData: FormData) {
  const admin = await requireAdminUser();
  let creatorId: number | null = null;
  try {
    creatorId = formData.get("id") ? id(formData.get("id")) : null;
    const relationType = formData.get("relationType");
    if (relationType !== "pseudonym_of") throw new Error("invalid-relation-type");
    const relations = formData.getAll("relatedCreatorIds").map(value => ({ targetCreatorId: id(value), relationType: "pseudonym_of" as const }));
    const values = { ...(formData.has("nameRu") ? { nameRu: formData.get("nameRu") === "" ? null : text(formData.get("nameRu")) } : {}), ...(formData.has("birthDate") ? { birthDate: parseCreatorDate(formData.get("birthDate")) } : {}), ...(formData.has("deathDate") ? { deathDate: parseCreatorDate(formData.get("deathDate")) } : {}), relations, adminId: admin.id, name: text(formData.get("name")), slug: text(formData.get("slug")), originalName: formData.get("originalName") ? text(formData.get("originalName")) : null, typeId: id(formData.get("typeId")), seriesIds: formData.getAll("seriesIds").map(id) };
    const creator = creatorId ? await creators.updateCreator(creatorId, values) : await creators.createCreator(values);
    if (!creator) throw new Error("not-found");
    creatorId = creator.id;
  } catch (error) {
    const dateError = error instanceof Error && ["Укажите полную корректную дату.", "Дата смерти не может предшествовать дате рождения.", "Даты доступны для персоны без исходящей связи псевдонима или для организации."].includes(error.message);
    const errorCode = dateError ? "dates" : error instanceof Error && error.message === "creator-type-in-use" ? "type-in-use" : "1";
    redirect(creatorId ? `/admin/creators/${creatorId}/edit?error=${errorCode}` : `/admin/creators/new?error=${errorCode}`);
  }
  refresh();
  redirect(`/admin/creators/${creatorId}/edit?updated=1`);
}

export async function deleteCreatorAction(formData: FormData) {
  const admin = await requireAdminUser();
  try {
    const deleted = await creators.deleteCreator(id(formData.get("id")), admin.id);
    await deleteCreatorAvatarBestEffort(deleted?.avatarObjectKey ?? null);
  } catch { redirect("/admin/creators?error=1"); }
  refresh(); redirect("/admin/creators?updated=1");
}

export async function saveCreatorDictionaryAction(formData: FormData) {
  const admin = await requireAdminUser();
  const role = formData.get("kind") === "role";
  const path = role ? "/admin/creators/roles" : "/admin/creators/types";
  try {
    const values = { adminId: admin.id, name: text(formData.get("name")), code: text(formData.get("code")) };
    const rowId = formData.get("id") ? id(formData.get("id")) : null;
    if (rowId) {
      if (role) await creators.updateCreatorRole(rowId, values); else await creators.updateCreatorType(rowId, values);
    } else if (role) await creators.createCreatorRole(values); else await creators.createCreatorType(values);
  } catch { redirect(`${path}?error=1`); }
  refresh(); redirect(`${path}?updated=1`);
}

export async function deleteCreatorDictionaryAction(formData: FormData) {
  const admin = await requireAdminUser();
  const path = formData.get("kind") === "role" ? "/admin/creators/roles" : "/admin/creators/types";
  try {
    if (formData.get("kind") === "role") await creators.deleteCreatorRole(id(formData.get("id")), admin.id);
    else await creators.deleteCreatorType(id(formData.get("id")), admin.id);
  } catch { redirect(`${path}?error=1`); }
  refresh(); redirect(`${path}?updated=1`);
}

export async function resolveCreatorAction(formData: FormData) {
  const admin = await requireAdminUser();
  try {
    const decision = formData.get("decision");
    if (decision !== "create" && decision !== "map" && decision !== "exclude") throw new Error("invalid-decision");
    const typeCode = formData.get("typeCode");
    if (typeCode !== null && typeCode !== "person" && typeCode !== "collective" && typeCode !== "organization") throw new Error("invalid-creator-type");
    await requests.resolveCreatorRequest({requestId: id(formData.get("requestId")), adminId: admin.id, decision,
      ...(decision === "map" ? { creatorId: id(formData.get("creatorId")) } : {}),
      ...(decision === "create" ? { name: text(formData.get("name")), ...(typeCode ? { typeCode } : {}) } : {}) });
  } catch (error) {
    const code = error instanceof requests.CreatorRequestError && isCreatorRequestErrorCode(error.code) ? error.code : "1";
    redirect(`/admin/creator-requests?error=${code}`);
  }
  refresh(); redirect("/admin/creator-requests?updated=1");
}

export async function reopenCreatorAction(formData: FormData) {
  const admin = await requireAdminUser();
  const returnPath = formData.get("bindingId") || formData.get("mappingId")
    ? "/admin/creator-requests" : "/admin/creators?tab=ignored";
  const separator = returnPath.includes("?") ? "&" : "?";
  try {
    if (formData.get("bindingId")) await requests.reopenCreatorBinding({bindingId: id(formData.get("bindingId")), adminId: admin.id});
    else if (formData.get("mappingId")) await requests.reopenCreatorMapping({mappingId: id(formData.get("mappingId")), adminId: admin.id});
    else await requests.reopenCreatorExclusion({exclusionId: id(formData.get("exclusionId")), adminId: admin.id});
  } catch { redirect(`${returnPath}${separator}error=1`); }
  refresh(); redirect(`${returnPath}${separator}updated=1`);
}

export async function retryCreatorAction(formData: FormData) {
  const admin = await requireAdminUser();
  try { await requests.retryCreatorRequest({requestId: id(formData.get("requestId")), adminId: admin.id}); }
  catch { redirect("/admin/creator-requests?error=1"); }
  refresh(); redirect("/admin/creator-requests?updated=1");
}

export async function saveEntryCreatorsAction(formData: FormData) {
  await requireAdminUser();
  const entryId = id(formData.get("entryId"));
  try {
    const values = formData.getAll("creatorId");
    const roles = formData.getAll("roleId");
    if (values.length !== roles.length) throw new Error("invalid-pairs");
    await creators.setManualEntryCreators(entryId, values.flatMap((value, index) => value === "" ? [] : [{creatorId: id(value), roleId: id(roles[index])}]));
  } catch { redirect(`/admin/media/${entryId}/edit?creatorError=1`); }
  refresh(); redirect(`/admin/media/${entryId}/edit?creatorsSaved=1`);
}

export async function saveEntryPseudonymAction(formData: FormData) {
  const admin = await requireAdminUser();
  const entryId = id(formData.get("entryId"));
  try {
    const creatorId = formData.get("creatorId");
    await creators.setEntryPseudonym(entryId, creatorId === "" ? null : id(creatorId), admin.id);
  } catch { redirect(`/admin/media/${entryId}/edit?pseudonymError=1`); }
  refresh();
  redirect(`/admin/media/${entryId}/edit?pseudonymSaved=1`);
}


export async function resetCreatorNameLocalizationAction(formData: FormData) {
  const admin = await requireAdminUser();
  try {
    const ids = [...new Set(formData.getAll("creatorIds").map(id))];
    if (!ids.length || ids.length > 100) throw new Error("invalid-selection");
    const { resetCreatorNameLocalization } = await import("@/db/queries/creator-name-localization");
    await resetCreatorNameLocalization(ids, admin.id);
  } catch { redirect("/admin/creators?error=1"); }
  refresh();
  redirect("/admin/creators?updated=1");
}
