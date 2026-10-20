import { type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { randomUUID } from "node:crypto";
import { rename, stat, unlink } from "node:fs/promises";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getAdminExportById, markAdminExportFailed, markAdminExportReady, markAdminExportRunning, setAdminExportObjectKey } from "@/db/queries/admin-exports";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { JobError } from "@/lib/jobs/types";
import { createPostgresClient } from "@/lib/services/postgres";
import { writeDatabaseDump } from "./pg-dump";
import { deleteAdminExportFile, ensureLocalDumpDirectory, getLocalDumpPath } from "./storage";

export async function generateDatabaseDump(exportId: string, signal: AbortSignal, jobGuard?: SnapshotJobGuard) {
  signal.throwIfAborted();
  const client = createPostgresClient();
  let connection: Awaited<ReturnType<typeof client.reserve>> | undefined;
  let partialPath: string | undefined;
  let objectKey: string | undefined;
  let published = false;
  let started = false;
  try {
    connection = await client.reserve();
    const [lock] = await connection<{ locked: boolean }[]>`select pg_try_advisory_lock(6433, 1) as locked`;
    if (!lock.locked) throw new JobError("dump-busy", "Другой дамп базы ещё выполняется.", { deferSeconds: 30 });
    const current = await getAdminExportById(exportId);
    if (!current || current.status === "ready" || current.status === "expired") return;
    const item = await markAdminExportRunning(exportId, jobGuard);
    if (!item) return;
    started = true;
    // A previous worker can have stopped after writing but before publishing the result.
    if (item.objectKey) await deleteAdminExportFile({ objectKey: item.objectKey, entityType: "database_dump" });
    const [version] = await connection<{ server_version_num: string }[]>`show server_version_num`;
    if (Number(version.server_version_num) >= 190000) {
      throw new JobError("dump-version", "Обновите PostgreSQL client в образе worker до версии сервера.", { retryable: false });
    }
    await ensureLocalDumpDirectory();
    objectKey = `local-dumps/${randomUUID()}.sql.gz`;
    const filePath = getLocalDumpPath(objectKey);
    partialPath = `${filePath}.partial`;
    // Persist the attempt before writing so recovery can remove interrupted files.
    await setAdminExportObjectKey(item.id, objectKey, jobGuard);
    await writeDatabaseDump({ databaseUrl: process.env.DATABASE_URL!, filePath: partialPath, signal });
    const info = await stat(partialPath);
    if (!Number.isSafeInteger(info.size)) throw new JobError("dump-size", "Размер дампа превышает поддерживаемый предел.", { retryable: false });
    signal.throwIfAborted();
    await rename(partialPath, filePath);
    signal.throwIfAborted();
    const settings = await getArchiveSettings();
    await markAdminExportReady({
      id: item.id, objectKey, rowCount: null, fileSize: info.size,
      expiresAt: new Date(Date.now() + settings.exportRetentionDays * 86_400_000),
    }, jobGuard);
    published = true;
    await logSystemActivity({ action: "data-export.ready", entityType: "data-export", entityLabel: item.id, message: "Дамп базы сформирован.", metadata: { fileSize: info.size } });
  } catch (error) {
    if (published) return; // An audit-log failure must not invalidate a ready, downloadable dump.
    if (started) {
      if (objectKey) await deleteAdminExportFile({ objectKey, entityType: "database_dump" }).catch(() => undefined);
      const failure = error instanceof JobError ? error : new JobError("dump-failed", "Не удалось сформировать дамп базы.");
      await markAdminExportFailed(exportId, failure.message, jobGuard);
      await logSystemActivity({ action: "data-export.failed", entityType: "data-export", entityLabel: exportId, message: "Формирование дампа базы завершилось ошибкой.", status: "failure", severity: "warning" });
    }
    throw error;
  } finally {
    try {
      if (partialPath) await unlink(partialPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    } finally {
      // Closing this dedicated client releases the session-level advisory lock even after an error.
      connection?.release();
      await client.end({ timeout: 5 });
    }
  }
}
