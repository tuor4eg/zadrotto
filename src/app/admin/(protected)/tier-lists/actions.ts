"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteTierTemplate, moderateTierList, saveTierListSettings, saveTierTemplate, saveAdminTierList, searchTierListAdminAuthors, getAdminTierItems, getTierListAdminAuthor, TierListError, type AdminTierListInput } from "@/db/queries/tier-lists";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { logActivity } from "@/lib/activity-logs/server";
import { DEFAULT_TIER_LIST_LIMITS, MAX_TIER_LIST_PAYLOAD_BYTES, parseTierConfiguration, type TierActionResult, type TierListLimits } from "@/lib/tier-lists/model";

async function run(operation: string, mutation: (adminId: number) => Promise<unknown>, path: string) {
  const admin = await requireAdminUser();
  try {
    await mutation(admin.id);
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Не удалось сохранить изменения.")}`);
  }
  await logActivity({ action: "tier-list.admin-updated", actorType: "admin", adminUserId: admin.id, entityType: "tier-list", message: operation });
  revalidatePath("/admin/tier-lists");
  revalidatePath("/tier-lists", "layout");
  revalidatePath("/admin/settings/tier-lists");
  redirect(`${path}?saved=1`);
}

export async function saveSettingsAction(form: FormData) {
  await run("Изменены лимиты тир-листов.", async (adminId) => {
    const limits = Object.fromEntries(Object.keys(DEFAULT_TIER_LIST_LIMITS).map((key) => [key, Number(form.get(key))])) as TierListLimits;
    if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1 || value > 10000)) throw new Error("Укажите целые положительные лимиты до 10000.");
    await saveTierListSettings(limits, adminId);
  }, "/admin/settings/tier-lists");
}

export type TierTemplateFormState = { error: string | null; submissionId: number };

export async function saveTemplateAction(_state: TierTemplateFormState, form: FormData): Promise<TierTemplateFormState> {
  const admin = await requireAdminUser();
  let id: number | undefined;
  try {
    const rawId = String(form.get("id") ?? "");
    id = rawId ? Number(rawId) : undefined;
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)) throw new TierListError("validation", "Некорректный шаблон.");
    const rawLevels = String(form.get("levels") ?? "");
    if (Buffer.byteLength(rawLevels, "utf8") > MAX_TIER_LIST_PAYLOAD_BYTES) throw new TierListError("validation", "Слишком большой шаблон.");
    let levels: unknown;
    try { levels = JSON.parse(rawLevels); } catch { throw new TierListError("validation", "Некорректный список уровней."); }
    const configuration = parseTierConfiguration({ schemaVersion: 1, levels, backgroundColor: String(form.get("backgroundColor") ?? "") });
    if (!configuration) throw new TierListError("validation", "Проверьте названия уровней и цвета #RRGGBB.");
    await saveTierTemplate({ id, name: String(form.get("name") ?? "").trim(), configuration, isDefault: form.get("isDefault") === "1" }, admin.id);
  } catch (error) {
    if (!(error instanceof TierListError)) console.error("Tier template save failed", error);
    return { error: error instanceof TierListError ? error.message : "Не удалось сохранить шаблон. Повторите попытку.", submissionId: Date.now() };
  }
  await logActivity({ action: "tier-list.admin-updated", actorType: "admin", adminUserId: admin.id, entityType: "tier-list", message: "Сохранён шаблон тир-листа." });
  revalidatePath("/admin/settings/tier-lists");
  if (id) revalidatePath(`/admin/settings/tier-lists/templates/${id}/edit`);
  redirect("/admin/settings/tier-lists?saved=1");
}

export async function deleteTemplateAction(form: FormData) {
  await run("Удалён шаблон тир-листа.", (adminId) => deleteTierTemplate(Number(form.get("id")), adminId), "/admin/settings/tier-lists");
}

export async function moderateAction(form: FormData) {
  await run("Изменено состояние тир-листа модератором.", async (adminId) => {
    const action = form.get("action");
    if (action !== "hide" && action !== "restore" && action !== "delete") throw new Error("Недопустимое действие.");
    await moderateTierList({ publicId: String(form.get("publicId")), action }, adminId);
  }, "/admin/tier-lists");
}


export async function searchTierListAdminAuthorsAction(query: string) {
  await requireAdminUser();
  return typeof query === "string" ? searchTierListAdminAuthors(query) : [];
}

export async function getAdminTierListItemsAction(input: {ids:number[];authorId:number}) {
  await requireAdminUser();
  if (!input || !Array.isArray(input.ids) || input.ids.length > 1000 || input.ids.some(id => !Number.isSafeInteger(id) || id < 1 || id > 2147483647) || !Number.isSafeInteger(input.authorId)) return [];
  if (!await getTierListAdminAuthor(input.authorId,true)) return [];
  return getAdminTierItems([...new Set(input.ids)], input.authorId);
}

export async function saveAdminTierListAction(input: AdminTierListInput): Promise<TierActionResult> {
  const admin = await requireAdminUser();
  try {
    const keys = ["publicId", "version", "clientCreationId", "authorId", "templateId", "title", "distribution", "status"];
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key)) || Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_TIER_LIST_PAYLOAD_BYTES) throw new TierListError("validation", "Некорректные данные тир-листа.");
    const document = await saveAdminTierList(input, admin.id);
    await logActivity({ action: "tier-list.admin-updated", actorType: "admin", adminUserId: admin.id, entityType: "tier-list", entityId: document.id, entityLabel: document.title, message: input.publicId ? "Тир-лист отредактирован администратором." : "Тир-лист создан администратором.", metadata: { authorId: document.authorId } });
    revalidatePath("/admin/tier-lists");
    revalidatePath(`/admin/tier-lists/${document.publicId}/edit`);
    revalidatePath("/tier-lists", "layout");
    revalidatePath("/feed");
    return { ok: true, document };
  } catch (error) {
    if (error instanceof TierListError) return { ok: false, code: error.code, error: error.message };
    console.error("Admin tier-list save failed", error);
    return { ok: false, code: "server", error: "Не удалось сохранить тир-лист. Повторите попытку." };
  }
}
