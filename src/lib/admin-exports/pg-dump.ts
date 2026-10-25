import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { JobError } from "../jobs/types";

export const PG_DUMP_ARGS = [
  "--format=plain", "--no-owner", "--no-acl", "--no-password", "--lock-wait-timeout=10s",
] as const;

export function getPgDumpConnection(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.pathname.slice(1) || url.searchParams.has("sslpassword")) throw new Error();
    const password = url.searchParams.get("password") ?? (url.password ? decodeURIComponent(url.password) : undefined);
    url.password = "";
    url.searchParams.delete("password");
    return { connectionString: url.toString(), password };
  } catch {
    throw new JobError("dump-config", "Проверьте DATABASE_URL: нужна PostgreSQL-база без параметра sslpassword.", { retryable: false });
  }
}

export function getPgDumpFailure(stderr: string) {
  if (/server version mismatch|aborting because of server version/i.test(stderr)) {
    return new JobError("dump-version", "Версия pg_dump несовместима с сервером PostgreSQL.", { retryable: false });
  }
  if (/permission denied|row-level security|authentication failed|no pg_hba.conf entry/i.test(stderr)) {
    return new JobError("dump-permissions", "Недостаточно прав для полного дампа базы или отказано в подключении.", { retryable: false });
  }
  if (/invalid connection option|invalid URI|invalid sslmode|certificate verify failed|does not exist/i.test(stderr)) {
    return new JobError("dump-config", "Проверьте настройки подключения и сертификаты PostgreSQL.", { retryable: false });
  }
  return new JobError("dump-failed", "Не удалось сформировать дамп базы.");
}

/** The executable override is used by process-level tests; it is never accepted from an admin request. */
export async function writeDatabaseDump(input: {
  databaseUrl: string;
  filePath: string;
  signal: AbortSignal;
  executable?: string;
}) {
  input.signal.throwIfAborted();
  const connection = getPgDumpConnection(input.databaseUrl);
  // pg_dump is installed in the runtime image; it is not a bundled project asset.
  const child = spawn(/* turbopackIgnore: true */ input.executable ?? "pg_dump", [...PG_DUMP_ARGS, `--dbname=${connection.connectionString}`], {
    shell: false,
    // libpq expands a URI passed as dbname, but not a URI supplied through PGDATABASE defaults.
    env: { ...process.env, PGPASSWORD: connection.password ?? process.env.PGPASSWORD, PGCONNECT_TIMEOUT: "10", PGAPPNAME: "geekoteka-database-dump", LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-65_536);
  });
  const exit = new Promise<void>((resolve, reject) => {
    child.once("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "ENOENT"
        ? new JobError("dump-unavailable", "Worker не находит pg_dump в PATH. Установите клиент PostgreSQL на машине worker или обновите его Docker-образ, затем повторите экспорт.", { retryable: false })
        : new JobError("dump-process", "Не удалось запустить pg_dump.", { retryable: false }));
    });
    child.once("close", (code) => code === 0 ? resolve() : reject(getPgDumpFailure(stderr)));
  });
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const terminate = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    killTimer ??= setTimeout(() => child.kill("SIGKILL"), 2000);
    killTimer.unref();
  };
  input.signal.addEventListener("abort", terminate, { once: true });
  const gzip = pipeline(child.stdout, createGzip(), createWriteStream(input.filePath, { flags: "wx", mode: 0o600 }), { signal: input.signal });
  try {
    await Promise.all([exit, gzip]);
    input.signal.throwIfAborted();
  } catch (error) {
    terminate();
    await Promise.allSettled([exit, gzip]);
    if (input.signal.aborted) throw new JobError("timeout", "Формирование дампа прервано.");
    if (error instanceof JobError) throw error;
    throw new JobError("dump-file", "Не удалось записать дамп. Проверьте свободное место worker.", { retryable: false });
  } finally {
    input.signal.removeEventListener("abort", terminate);
    if (killTimer) clearTimeout(killTimer);
  }
}
