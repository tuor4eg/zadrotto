import { constants } from "node:fs";
import { mkdir, open, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Readable } from "node:stream";
import { deleteS3Object, fetchS3Object } from "@/lib/services/minio";

const LOCAL_KEY = /^local-dumps\/([0-9a-f-]{36})\.sql\.gz$/;

export function getLocalDumpDirectory() {
  return resolve(process.env.ADMIN_EXPORTS_DIR?.trim() || ".data/admin-exports");
}

export async function ensureLocalDumpDirectory() {
  const directory = getLocalDumpDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}

export function getLocalDumpPath(objectKey: string) {
  const match = LOCAL_KEY.exec(objectKey);
  if (!match) throw new Error("Некорректный путь локального дампа.");
  return join(getLocalDumpDirectory(), `${match[1]}.sql.gz`);
}

export async function fetchAdminExportFile(input: { objectKey: string; entityType: string; signal?: AbortSignal }) {
  if (!input.objectKey.startsWith("local-dumps/")) {
    return fetchS3Object({ ...input, env: getAdminExportStorageEnv(input.entityType) });
  }
  const handle = await open(getLocalDumpPath(input.objectKey), constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!handle) return null;
  try {
    if (!(await handle.stat()).isFile()) throw new Error("Некорректный файл дампа.");
    const stream = handle.createReadStream({ signal: input.signal });
    return { body: Readable.toWeb(stream) as ReadableStream<Uint8Array> };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function deleteAdminExportFile(input: { objectKey: string; entityType: string }) {
  if (!input.objectKey.startsWith("local-dumps/")) {
    return deleteS3Object({ objectKey: input.objectKey, env: getAdminExportStorageEnv(input.entityType) });
  }
  const path = getLocalDumpPath(input.objectKey);
  for (const file of [path, `${path}.partial`]) {
    await unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
}

/** Compatibility with dumps created before local storage was introduced. */
export function getAdminExportStorageEnv(entityType: string) {
  if (entityType !== "database_dump") return undefined;
  return {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.ADMIN_EXPORTS_S3_BUCKET?.trim() || process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  };
}
