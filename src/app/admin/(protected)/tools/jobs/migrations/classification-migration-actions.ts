"use server";

import { classificationManifestFromSelection } from "@/lib/classification-migration/selection";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { approveClassificationMigration, createClassificationPreview, requestClassificationRollback, getClassificationInventory } from "@/db/queries/classification-migration";

const PATH = "/admin/tools/jobs/migrations";
function identifiers(form: FormData) {
  const id = String(form.get("migrationId") ?? "");
  const hash = String(form.get("previewHash") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{64}$/.test(hash)) throw new Error("Некорректный предпросмотр.");
  return { id, hash };
}
function message(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : "Не удалось выполнить операцию.";
}
export async function createPreviewAction(form: FormData) {
  const admin = await requireAdminUser();
  let id: string;
  try {
    const current = await getClassificationInventory();
    const expectedHash = String(form.get("selectionHash") ?? "");
    if (expectedHash !== current.hash) throw new Error("Данные изменились. Откройте дерево заново и проверьте выбор.");
    const manifest = classificationManifestFromSelection(current.state, form);
    id = (await createClassificationPreview(manifest, admin.id, expectedHash)).id;
  } catch (error) {
    redirect(`${PATH}?classification=1&classificationError=${encodeURIComponent(message(error))}#classification`);
  }
  revalidatePath(PATH);
  redirect(`${PATH}?classificationId=${id}#classification`);
}
export async function approveMigrationAction(form: FormData) {
  const admin = await requireAdminUser();
  let id = "";
  try {
    const input = identifiers(form); id = input.id;
    if (form.get("confirmation") !== "ПЕРЕНЕСТИ ТЕМЫ") throw new Error("Введите ПЕРЕНЕСТИ ТЕМЫ для подтверждения просмотренного плана.");
    await approveClassificationMigration(id, input.hash, admin.id);
  } catch (error) {
    redirect(`${PATH}?classification=1&classificationId=${id}&classificationError=${encodeURIComponent(message(error))}#classification`);
  }
  revalidatePath(PATH);
  redirect(`${PATH}?classificationId=${id}&classificationQueued=1#classification`);
}
export async function rollbackMigrationAction(form: FormData) {
  const admin = await requireAdminUser();
  let id = "";
  try {
    const input = identifiers(form); id = input.id;
    if (form.get("confirmation") !== "ОТКАТИТЬ ПЕРЕНОС") throw new Error("Введите ОТКАТИТЬ ПЕРЕНОС для подтверждения.");
    await requestClassificationRollback(id, input.hash, admin.id);
  } catch (error) {
    redirect(`${PATH}?classification=1&classificationId=${id}&classificationError=${encodeURIComponent(message(error))}#classification`);
  }
  revalidatePath(PATH);
  redirect(`${PATH}?classificationId=${id}&classificationQueued=1#classification`);
}
