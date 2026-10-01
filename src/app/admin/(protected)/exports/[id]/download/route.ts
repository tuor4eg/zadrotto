import { getAdminExportForOwner } from "@/db/queries/admin-exports";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { fetchS3Object } from "@/lib/services/minio";
import { logActivity } from "@/lib/activity-logs/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [admin, { id }] = await Promise.all([requireAdminUser(), params]);
  const item = await getAdminExportForOwner(id, admin.id);
  if (!item || item.status !== "ready" || !item.objectKey || item.expiresAt <= new Date()) {
    return new Response("Файл экспорта недоступен.", { status: 404 });
  }
  const stored = await fetchS3Object({ objectKey: item.objectKey });
  if (!stored?.body) return new Response("Файл экспорта не найден.", { status: 404 });
  await logActivity({ action: "data-export.downloaded", actorType: "admin", adminUserId: admin.id, entityType: "data-export", entityLabel: item.id, message: "Файл экспорта скачан." });
  const filename = `${item.entityType === "media_items" ? "media-items" : "series"}-${item.createdAt.toISOString().slice(0, 10)}.csv`;
  return new Response(stored.body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
