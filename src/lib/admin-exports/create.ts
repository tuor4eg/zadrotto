import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getActiveAdminExports, getAdminExportForOwner, insertAdminExport, markAdminExportFailed, requeueAdminExport, type AdminExportFilters } from "@/db/queries/admin-exports";
import { fetchS3Object } from "@/lib/services/minio";
import { enqueueJobRun } from "@/lib/jobs/queue";
import { ADMIN_EXPORT_ENTITY_TYPES, parseAdminExportFields, type AdminExportEntityType } from "./model";

function normalizeFilters(type: AdminExportEntityType, value: AdminExportFilters): AdminExportFilters {
  const q = value.q?.trim();
  if (type === "series") return q ? { q } : {};
  return {
    ...(q ? { q } : {}),
    ...(Number.isSafeInteger(value.authorId) && Number(value.authorId) > 0 ? { authorId: Number(value.authorId) } : {}),
    ...(Number.isSafeInteger(value.mediaCarrierId) && Number(value.mediaCarrierId) > 0 ? { mediaCarrierId: Number(value.mediaCarrierId) } : {}),
    ...(value.mediaType?.trim() ? { mediaType: value.mediaType.trim() } : {}),
    ...(value.metadata === "missing" || value.metadata === "absent" ? { metadata: value.metadata } : {}),
  };
}

export async function createAdminExport(input: { adminId: number; entityType: AdminExportEntityType; fields: unknown; filters?: AdminExportFilters; sort?: string }) {
  if (!ADMIN_EXPORT_ENTITY_TYPES.includes(input.entityType)) throw new Error("Некорректный тип экспорта.");
  const fields = parseAdminExportFields(input.entityType, input.fields);
  const filters = normalizeFilters(input.entityType, input.filters ?? {});
  const sort = input.sort?.trim() || "title";
  const duplicate = (await getActiveAdminExports(input.adminId)).find((row) => row.entityType === input.entityType && row.sort === sort && JSON.stringify(row.fields) === JSON.stringify(fields) && JSON.stringify(row.filters) === JSON.stringify(filters));
  if (duplicate) return duplicate;
  const settings = await getArchiveSettings();
  const expiresAt = new Date(Date.now() + settings.exportRetentionDays * 86_400_000);
  const created = await insertAdminExport({ adminId: input.adminId, entityType: input.entityType, fields, filters, sort, expiresAt });
  try {
    await enqueueJobRun({ createdByAdminId: input.adminId, payload: { exportId: created.id }, source: "manual", type: "admin.export-generate" });
  } catch (error) {
    await markAdminExportFailed(created.id, "Не удалось поставить экспорт в очередь.");
    throw error;
  }
  return created;
}

export async function getDownloadableAdminExport(input: { adminId: number; exportId: string }) {
  const item = await getAdminExportForOwner(input.exportId, input.adminId);
  if (!item) throw new Error("Экспорт не найден.");
  if (item.status !== "ready" || !item.objectKey) throw new Error("Файл экспорта ещё не готов.");
  if (item.expiresAt <= new Date()) throw new Error("Срок хранения экспорта истёк.");
  const response = await fetchS3Object({ objectKey: item.objectKey });
  if (!response?.body) throw new Error("Файл экспорта не найден в хранилище.");
  return { body: response.body, contentLength: item.fileSize, fileName: `${item.entityType}-${item.id}.csv` };
}

export async function retryAdminExport(input: { adminId: number; exportId: string }) {
  const current = await getAdminExportForOwner(input.exportId, input.adminId);
  if (!current || current.status !== "failed") throw new Error("Повторить можно только неудачный экспорт.");
  const row = await requeueAdminExport(input.exportId, input.adminId);
  if (!row) throw new Error("Экспорт уже изменён.");
  try {
    await enqueueJobRun({ createdByAdminId: input.adminId, payload: { exportId: row.id }, source: "manual", type: "admin.export-generate" });
  } catch (error) {
    await markAdminExportFailed(row.id, "Не удалось поставить экспорт в очередь.");
    throw error;
  }
  return row;
}
