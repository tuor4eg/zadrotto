import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { getAdminExportDownload } from "../src/lib/admin-exports/model";
import { getPgDumpConnection, getPgDumpFailure, PG_DUMP_ARGS, writeDatabaseDump } from "../src/lib/admin-exports/pg-dump";
import { aclAllowsPublicRead, policyAllowsPublicRead } from "../src/lib/admin-exports/storage-policy";
import { JobError } from "../src/lib/jobs/types";
import { getDatabaseDumpCreationErrorCode } from "../src/lib/admin-exports/errors";

const databaseUrl = "postgresql://user:dummy-secret@localhost/example?sslmode=require";

test("creation identifies an unapplied migration without exposing SQL, parameters or arbitrary errors", () => {
  const postgresError = { code: "23514", constraint_name: "admin_exports_entity_type_check", detail: "dummy-secret" };
  assert.equal(getDatabaseDumpCreationErrorCode(postgresError), "dump-migration");
  assert.equal(getDatabaseDumpCreationErrorCode({ cause: postgresError, query: "private SQL" }), "dump-migration");
  for (const error of [null, undefined, new Error("dummy-secret"), { code: "23514", constraint_name: "other_constraint" }, { cause: { code: "08006" } }]) {
    assert.equal(getDatabaseDumpCreationErrorCode(error), "create");
  }
  const circular: { cause?: unknown } = {};
  circular.cause = circular;
  assert.equal(getDatabaseDumpCreationErrorCode(circular), "create");
});

async function fakeExecutable(directory: string, source: string) {
  const path = join(directory, "fake-pg-dump.cjs");
  await writeFile(path, `#!${process.execPath}\n${source}`, { mode: 0o700 });
  return path;
}

test("dump is gzipped, passwords stay outside argv, SSL is preserved and file permissions are private", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dump-test-"));
  try {
    const executable = await fakeExecutable(directory, "process.stdout.write(JSON.stringify({args:process.argv.slice(2),password:process.env.PGPASSWORD}));");
    const filePath = join(directory, "dump.sql.gz");
    await writeDatabaseDump({ databaseUrl, executable, filePath, signal: new AbortController().signal });
    const output = JSON.parse(gunzipSync(await readFile(filePath)).toString());
    assert.deepEqual(output, { args: [...PG_DUMP_ARGS, "--dbname=postgresql://user@localhost/example?sslmode=require"], password: "dummy-secret" });
    assert.equal(output.args.some((arg: string) => arg.includes("dummy-secret")), false);
    assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("partial stdout followed by pg_dump failure cannot count as successful export or expose stderr secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dump-test-"));
  try {
    const executable = await fakeExecutable(directory, 'process.stdout.write("CREATE TABLE partial();"); process.stderr.write("permission denied dummy-secret"); process.exitCode=1;');
    await assert.rejects(writeDatabaseDump({ databaseUrl, executable, filePath: join(directory, "dump.sql.gz"), signal: new AbortController().signal }), (error: unknown) => {
      assert.ok(error instanceof JobError);
      assert.equal(error.code, "dump-permissions");
      assert.equal(error.retryable, false);
      assert.equal(error.message.includes("dummy-secret"), false);
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing pg_dump and unavailable disk fail without publishing a gzip result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dump-test-"));
  try {
    await assert.rejects(writeDatabaseDump({ databaseUrl, executable: join(directory, "missing"), filePath: join(directory, "dump.sql.gz"), signal: new AbortController().signal }), (error: unknown) => error instanceof JobError && error.code === "dump-unavailable");
    const executable = await fakeExecutable(directory, 'setInterval(()=>process.stdout.write("SQL\\n"),10);');
    await assert.rejects(writeDatabaseDump({ databaseUrl, executable, filePath: join(directory, "missing", "dump.sql.gz"), signal: new AbortController().signal }), (error: unknown) => error instanceof JobError && error.code === "dump-file");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("abort terminates even a pg_dump process that ignores SIGTERM", { timeout: 8000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "dump-test-"));
  const controller = new AbortController();
  try {
    const pidPath = join(directory, "pid");
    const executable = await fakeExecutable(directory, `process.on("SIGTERM",()=>{}); process.stdout.on("error",()=>{}); require("node:fs").writeFileSync(${JSON.stringify(pidPath)},String(process.pid)); setInterval(()=>process.stdout.write("SQL\\n"),10);`);
    const completion = writeDatabaseDump({ databaseUrl, executable, filePath: join(directory, "dump.sql.gz"), signal: controller.signal });
    const rejected = assert.rejects(completion, (error: unknown) => error instanceof JobError && error.code === "timeout");
    let pid = "";
    for (let attempt = 0; attempt < 100 && !pid; attempt += 1) {
      pid = await readFile(pidPath, "utf8").catch(() => "");
      if (!pid) await delay(20);
    }
    assert.ok(pid, "child started");
    controller.abort();
    await rejected;
    assert.throws(() => process.kill(Number(pid), 0), { code: "ESRCH" });
  } finally {
    controller.abort();
    await rm(directory, { recursive: true, force: true });
  }
});

test("configuration failures are terminal while transport failures may be retried", () => {
  assert.deepEqual(getPgDumpConnection("postgres://u:ignored@db/example?password=a%40b%3Ac%2Fd&sslmode=verify-full&sslrootcert=%2Fcert.pem"), { connectionString: "postgres://u@db/example?sslmode=verify-full&sslrootcert=%2Fcert.pem", password: "a@b:c/d" });
  assert.equal(getPgDumpConnection("postgres://u:a%40b%3Ac%2Fd@db/example").password, "a@b:c/d");
  for (const url of ["mysql://u:p@db/example", "postgres://db/", "invalid", "postgres://db/example?sslpassword=secret"]) assert.throws(() => getPgDumpConnection(url), JobError);
  for (const message of ["aborting because of server version mismatch", "certificate verify failed", "query failed: ERROR: query would be affected by row-level security policy"]) {
    assert.equal(getPgDumpFailure(message).retryable, false);
  }
  assert.equal(getPgDumpFailure("connection to server failed: Connection refused").retryable, true);
});

test("dump download uses SQL.GZ attachment while existing CSV downloads keep their format", () => {
  const createdAt = new Date("2026-10-12T10:11:12.000Z");
  assert.deepEqual(getAdminExportDownload({ entityType: "database_dump", createdAt }), { filename: "geekoteka-db-2026-10-12T10-11-12-000Z.sql.gz", contentType: "application/gzip" });
  assert.deepEqual(getAdminExportDownload({ entityType: "series", createdAt }), { filename: "series-2026-10-12.csv", contentType: "text/csv; charset=utf-8" });
});

test("public cover prefixes are allowed but public dump permissions are rejected conservatively", () => {
  const resource = "arn:aws:s3:::geekoteka/admin-exports/id/attempt.sql.gz";
  const statement = { Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: "arn:aws:s3:::geekoteka/covers/*" };
  assert.equal(policyAllowsPublicRead({ Statement: [statement] }, resource), false);
  assert.equal(policyAllowsPublicRead({ Statement: [] }, resource), false);
  for (const overrides of [
    { Resource: "arn:aws:s3:::geekoteka/*" },
    { Resource: resource, Principal: { AWS: ["*"] } },
    { Resource: resource, Action: "s3:*" },
    { Resource: resource, Action: "*", Condition: { IpAddress: { "aws:SourceIp": "127.0.0.1/32" } } },
    { Resource: resource, NotPrincipal: { AWS: "account" } },
    { Resource: resource, NotAction: "s3:PutObject" },
    { NotResource: "arn:aws:s3:::other/*" },
  ]) assert.equal(policyAllowsPublicRead({ Statement: [{ ...statement, ...overrides }] }, resource), true);
  assert.equal(policyAllowsPublicRead(null, resource), true);
});

test("bucket ACL rejects both anonymous and authenticated public readers", () => {
  const privateAcl = '<AccessControlPolicy><AccessControlList><Grant><Grantee><ID>owner</ID></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>';
  assert.equal(aclAllowsPublicRead(privateAcl), false);
  for (const group of ["AllUsers", "AuthenticatedUsers"]) {
    assert.equal(aclAllowsPublicRead(`<AccessControlPolicy><AccessControlList><Grant><Grantee><URI>http://acs.amazonaws.com/groups/global/${group}</URI></Grantee><Permission>READ</Permission></Grant></AccessControlList></AccessControlPolicy>`), true);
  }
  assert.equal(aclAllowsPublicRead(""), true);
});
