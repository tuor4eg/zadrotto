import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getAdminExportById, markAdminExportFailed, markAdminExportReady, markAdminExportRunning, setAdminExportObjectKey } from "@/db/queries/admin-exports";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { JobError } from "@/lib/jobs/types";
import { deleteS3Object, getS3BucketAccessSettings, S3BucketAccessError, uploadS3ObjectStream } from "@/lib/services/minio";
import { createPostgresClient } from "@/lib/services/postgres";
import { writeDatabaseDump } from "./pg-dump";
import { getAdminExportStorageEnv } from "./storage";
import { aclAllowsPublicRead, policyAllowsPublicRead } from "./storage-policy";

const TEMP_PREFIX = "geekoteka-db-dump-";
const TEMP_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export async function cleanupDatabaseDumpFiles() {
  for (const entry of await readdir(tmpdir(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(TEMP_PREFIX)) continue;
    const path = join(tmpdir(), entry.name);
    const info = await stat(path).catch(() => null);
    if (info && Date.now() - info.mtimeMs > TEMP_MAX_AGE_MS) await rm(path, { recursive: true, force: true });
  }
}

export async function generateDatabaseDump(exportId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const client = createPostgresClient();
  let connection: Awaited<ReturnType<typeof client.reserve>> | undefined;
  let directory: string | undefined;
  let objectKey: string | undefined;
  let published = false;
  let started = false;
  const env = getAdminExportStorageEnv("database_dump");
  try {
    connection = await client.reserve();
    const [lock] = await connection<{ locked: boolean }[]>`select pg_try_advisory_lock(6433, 1) as locked`;
    if (!lock.locked) throw new JobError("dump-busy", "Другой дамп базы ещё выполняется.", { deferSeconds: 30 });
    const current = await getAdminExportById(exportId);
    if (!current || current.status === "ready" || current.status === "expired") return;
    const item = await markAdminExportRunning(exportId);
    if (!item) return;
    started = true;
    // A previous worker can have stopped after uploading but before publishing the result.
    if (item.objectKey) await deleteS3Object({ objectKey: item.objectKey, env });
    const [version] = await connection<{ server_version_num: string }[]>`show server_version_num`;
    if (Number(version.server_version_num) >= 190000) {
      throw new JobError("dump-version", "Обновите PostgreSQL client в образе worker до версии сервера.", { retryable: false });
    }
    objectKey = `admin-exports/${item.id}/${randomUUID()}.sql.gz`;
    try {
      const access = await getS3BucketAccessSettings({ env, signal });
      if (aclAllowsPublicRead(access.acl) || policyAllowsPublicRead(access.policy, `arn:aws:s3:::${access.bucket}/${objectKey}`)) {
        throw new JobError("dump-storage", "S3 допускает публичное чтение дампов. Укажите закрытый ADMIN_EXPORTS_S3_BUCKET.", { retryable: false });
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof JobError) throw error;
      throw new JobError("dump-storage", "Не удалось подтвердить закрытый доступ S3. Проверьте бакет и права GetBucketPolicy/GetBucketAcl; при необходимости задайте ADMIN_EXPORTS_S3_BUCKET.", { retryable: !(error instanceof S3BucketAccessError) || error.retryable });
    }
    await cleanupDatabaseDumpFiles();
    directory = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
    const filePath = join(directory, "database.sql.gz");
    await writeDatabaseDump({ databaseUrl: process.env.DATABASE_URL!, filePath, signal });
    const info = await stat(filePath);
    if (!Number.isSafeInteger(info.size)) throw new JobError("dump-size", "Размер дампа превышает поддерживаемый предел.", { retryable: false });
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(filePath, { signal })) hash.update(chunk);
    signal.throwIfAborted();
    // Keep the attempt address for recovery/expiry cleanup even if the worker is forcefully stopped.
    await setAdminExportObjectKey(item.id, objectKey);
    signal.throwIfAborted();
    const body = createReadStream(filePath, { signal });
    try {
      await uploadS3ObjectStream({ objectKey, body, contentLength: info.size, contentType: "application/gzip", payloadHash: hash.digest("hex"), env, signal });
    } finally {
      body.destroy();
    }
    signal.throwIfAborted();
    const settings = await getArchiveSettings();
    await markAdminExportReady({
      id: item.id, objectKey, rowCount: null, fileSize: info.size,
      expiresAt: new Date(Date.now() + settings.exportRetentionDays * 86_400_000),
    });
    published = true;
    await logSystemActivity({ action: "data-export.ready", entityType: "data-export", entityLabel: item.id, message: "Дамп базы сформирован.", metadata: { fileSize: info.size } });
  } catch (error) {
    if (published) return; // An audit-log failure must not invalidate a ready, downloadable dump.
    if (started) {
      if (objectKey) await deleteS3Object({ objectKey, env }).catch(() => undefined);
      const failure = error instanceof JobError ? error : new JobError("dump-failed", "Не удалось сформировать дамп базы.");
      await markAdminExportFailed(exportId, failure.message);
      await logSystemActivity({ action: "data-export.failed", entityType: "data-export", entityLabel: exportId, message: "Формирование дампа базы завершилось ошибкой.", status: "failure", severity: "warning" });
    }
    throw error;
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      // Closing this dedicated client releases the session-level advisory lock even after an error.
      connection?.release();
      await client.end({ timeout: 5 });
    }
  }
}
