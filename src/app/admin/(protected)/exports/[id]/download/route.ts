import { getAdminExportForOwner } from "@/db/queries/admin-exports";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { logActivity } from "@/lib/activity-logs/server";
import { getAdminExportDownload } from "@/lib/admin-exports/model";
import { fetchAdminExportFile } from "@/lib/admin-exports/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [admin, { id }] = await Promise.all([requireAdminUser(), params]);
  const item = await getAdminExportForOwner(id, admin.id);
  if (!item || item.status !== "ready" || !item.objectKey || item.expiresAt <= new Date()) {
    return new Response("Файл экспорта недоступен.", { status: 404 });
  }
  const stored = await fetchAdminExportFile({ objectKey: item.objectKey, entityType: item.entityType, signal: _request.signal });
  if (!stored?.body) return new Response("Файл экспорта не найден.", { status: 404 });
  await logActivity({ action: "data-export.downloaded", actorType: "admin", adminUserId: admin.id, entityType: "data-export", entityLabel: item.id, message: "Запрошено скачивание файла экспорта." });
  const { filename, contentType } = getAdminExportDownload(item);
  return new Response(stored.body, { headers: {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    ...(item.fileSize === null ? {} : { "Content-Length": String(item.fileSize) }),
  } });
}
