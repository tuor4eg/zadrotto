import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deleteAdminExportFile, ensureLocalDumpDirectory, fetchAdminExportFile, getLocalDumpPath } from "../src/lib/admin-exports/storage";

test("local dumps reject traversal and symlinks, stream files, and remove interrupted attempts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "local-dumps-test-"));
  const previous = process.env.ADMIN_EXPORTS_DIR;
  process.env.ADMIN_EXPORTS_DIR = join(directory, "exports");
  try {
    await ensureLocalDumpDirectory();
    assert.equal((await stat(process.env.ADMIN_EXPORTS_DIR)).mode & 0o777, 0o700);
    assert.throws(() => getLocalDumpPath("local-dumps/../../secret.sql.gz"));
    const objectKey = `local-dumps/${randomUUID()}.sql.gz`;
    const path = getLocalDumpPath(objectKey);
    assert.equal(await fetchAdminExportFile({ objectKey, entityType: "database_dump" }), null);
    await writeFile(path, "dump", { mode: 0o600 });
    const result = await fetchAdminExportFile({ objectKey, entityType: "database_dump" });
    assert.equal(await new Response(result!.body).text(), "dump");
    await writeFile(`${path}.partial`, "unfinished");
    await deleteAdminExportFile({ objectKey, entityType: "database_dump" });
    await deleteAdminExportFile({ objectKey, entityType: "database_dump" });
    await assert.rejects(stat(`${path}.partial`), { code: "ENOENT" });
    await symlink(join(directory, "secret"), path);
    await assert.rejects(fetchAdminExportFile({ objectKey, entityType: "database_dump" }), { code: "ELOOP" });
    await deleteAdminExportFile({ objectKey, entityType: "database_dump" });
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EXPORTS_DIR;
    else process.env.ADMIN_EXPORTS_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
