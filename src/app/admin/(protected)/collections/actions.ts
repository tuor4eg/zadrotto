"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createEditorialCollection,
  deleteEditorialCollection,
  getEditorialCollectionById,
  setEditorialCollectionPublicationStatus,
  updateEditorialCollection,
} from "@/db/queries/editorial-collections";
import type { EditorialDocumentBlockInput } from "@/lib/editorial-documents/model";
import { logActivity } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { deleteCollectionImageBestEffort, uploadCollectionImage } from "@/lib/collections/images";

export type CollectionFormState = { error: string | null; submissionId: number };

function errorState(message: string): CollectionFormState {
  return { error: message, submissionId: Date.now() };
}

function parseId(value: FormDataEntryValue | null) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseBlocks(value: FormDataEntryValue | null): EditorialDocumentBlockInput[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.map((block) => {
      if (block?.type === "media") return {
        type: "media" as const,
        mediaItemId: Number(block.mediaItemId),
        editorialComment: typeof block.editorialComment === "string" ? block.editorialComment.trim() || null : null,
      };
      if (block?.type === "heading" || block?.type === "text") return {
        type: block.type,
        content: typeof block.content === "string" ? block.content : "",
      };
      throw new Error();
    });
  } catch {
    throw new Error("blocks-invalid");
  }
}

function getErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "save";
  if (code === "title") return "Укажите название подборки.";
  if (code === "description-length") return "Описание должно быть не длиннее 10 000 символов.";
  if (code === "comment-length") return "Комментарий к записи должен быть не длиннее 1 000 символов.";
  if (code === "blocks-limit") return "В подборке может быть не больше 300 блоков.";
  if (code === "media-blocks-limit") return "В подборке может быть не больше 200 записей.";
  if (code === "blocks-invalid") return "Содержимое подборки повреждено. Обновите страницу и попробуйте снова.";
  if (code === "heading-empty") return "Заполните пустой заголовок.";
  if (code === "text-empty") return "Заполните пустой текстовый блок.";
  if (code === "heading-length") return "Заголовок раздела должен быть не длиннее 200 символов.";
  if (code === "text-length") return "Текстовый блок должен быть не длиннее 5 000 символов.";
  if (code.startsWith("items-unpublished:")) return `Некоторые записи больше не опубликованы: ${code.slice(18) || "неизвестные записи"}.`;
  if (code === "image-too-large") return "Обложка должна быть не больше 5 МБ.";
  if (code === "image-invalid") return "Нужен корректный файл JPG, PNG или WebP.";
  return "Не удалось сохранить подборку. Подробности записаны в журнал сервера.";
}

async function readUpload(form: FormData, currentKey: string | null) {
  if (form.get("removeImage") === "1") return { key: null, uploaded: null };
  const file = form.get("imageFile");
  if (!(file instanceof File) || file.size === 0) return { key: currentKey, uploaded: null };
  const result = await uploadCollectionImage(file);
  if (!result.ok) throw new Error(result.error);
  return { key: result.objectKey, uploaded: result.objectKey };
}

function revalidateCollection(slug?: string) {
  revalidatePath("/admin/collections");
  revalidatePath("/collections");
  if (slug) revalidatePath(`/collections/${slug}`);
}

export async function createCollectionAction(_state: CollectionFormState, form: FormData): Promise<CollectionFormState> {
  const admin = await requireAdminUser();
  let uploaded: string | null = null;
  try {
    const image = await readUpload(form, null);
    uploaded = image.uploaded;
    const collection = await createEditorialCollection({
      adminId: admin.id,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? "").trim() || null,
      coverObjectKey: image.key,
      blocks: parseBlocks(form.get("blocks")),
    });
    revalidateCollection(collection.slug);
    await logActivity({ action: "collection.created", actorType: "admin", adminUserId: admin.id, entityType: "collection", entityId: collection.id, entityLabel: collection.title, message: "Подборка создана." });
    redirect(`/admin/collections/${collection.id}/edit?created=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    await deleteCollectionImageBestEffort(uploaded);
    console.error("Не удалось создать подборку.", error);
    return errorState(getErrorMessage(error));
  }
}

export async function updateCollectionAction(_state: CollectionFormState, form: FormData): Promise<CollectionFormState> {
  const admin = await requireAdminUser();
  const id = parseId(form.get("collectionId"));
  if (!id) return errorState("Некорректная подборка.");
  const current = await getEditorialCollectionById(id);
  if (!current) return errorState("Подборка не найдена.");
  let uploaded: string | null = null;
  try {
    const image = await readUpload(form, current.coverObjectKey);
    uploaded = image.uploaded;
    const collection = await updateEditorialCollection(id, {
      adminId: admin.id,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? "").trim() || null,
      coverObjectKey: image.key,
      blocks: parseBlocks(form.get("blocks")),
    });
    if (!collection) return errorState("Подборка не найдена.");
    if (current.coverObjectKey !== image.key) await deleteCollectionImageBestEffort(current.coverObjectKey);
    revalidateCollection(collection.slug);
    await logActivity({ action: "collection.updated", actorType: "admin", adminUserId: admin.id, entityType: "collection", entityId: collection.id, entityLabel: collection.title, message: "Подборка обновлена." });
    redirect(`/admin/collections/${collection.id}/edit?updated=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    await deleteCollectionImageBestEffort(uploaded);
    console.error("Не удалось обновить подборку.", error);
    return errorState(getErrorMessage(error));
  }
}

export async function toggleCollectionPublicationAction(form: FormData) {
  const admin = await requireAdminUser();
  const id = parseId(form.get("collectionId"));
  const status = form.get("status");
  if (!id || (status !== "private" && status !== "published")) redirect("/admin/collections?error=invalid");
  try {
    const collection = await setEditorialCollectionPublicationStatus(id, status, admin.id);
    if (!collection) redirect("/admin/collections?error=invalid");
    revalidateCollection(collection.slug);
    await logActivity({ action: status === "published" ? "collection.published" : "collection.unpublished", actorType: "admin", adminUserId: admin.id, entityType: "collection", entityId: collection.id, entityLabel: collection.title, message: status === "published" ? "Подборка опубликована." : "Подборка снята с публикации." });
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const code = error instanceof Error && error.message === "empty"
      ? "empty"
      : error instanceof Error && error.message === "items-unpublished"
        ? "items-unpublished"
        : "status";
    redirect(`/admin/collections/${id}/edit?error=${code}`);
  }
  redirect(`/admin/collections/${id}/edit?status=${status}`);
}

export async function deleteCollectionAction(form: FormData) {
  const admin = await requireAdminUser();
  const id = parseId(form.get("collectionId"));
  if (!id) redirect("/admin/collections?error=invalid");
  const collection = await deleteEditorialCollection(id);
  if (!collection) redirect("/admin/collections?error=invalid");
  await deleteCollectionImageBestEffort(collection.coverObjectKey);
  revalidateCollection(collection.slug);
  await logActivity({ action: "collection.deleted", actorType: "admin", adminUserId: admin.id, entityType: "collection", entityId: collection.id, entityLabel: collection.title, message: "Подборка удалена." });
  redirect("/admin/collections?deleted=1");
}
