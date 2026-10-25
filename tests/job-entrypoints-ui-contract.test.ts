import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("generic and migration actions enforce separate server entrypoints", () => {
  const source = read("src/app/admin/(protected)/tools/jobs/actions.ts");
  assert.match(source, /assertJobManualPlacement\(String\(formData.get\("type"\) \?\? ""\), "general"\)/);
  assert.match(source, /assertJobManualPlacement\(type, "migration"\)/);
  assert.match(source, /formData.has\("payload"\)/);
});

test("schedule editing retains payload and uses typed fields instead of empty JSON", () => {
  const source = read("src/app/admin/(protected)/tools/jobs/jobs-manager.tsx");
  const manage = read("src/lib/jobs/manage.ts");
  assert.match(source, /initialPayload=\{selectedType === job\?\.type \? job.payload : \{\}\}/);
  assert.doesNotMatch(source, /name="payload" value="\{\}"/);
  assert.match(manage, /input.payload === undefined && current.type === input.type \? current.payload/);
  assert.match(source, /grid gap-3 xl:hidden/);
});

test("migration catalog has an empty state and its own typed forms", () => {
  const page = read("src/app/admin/(protected)/tools/jobs/migrations/page.tsx");
  const form = read("src/app/admin/(protected)/tools/jobs/migrations/migration-form.tsx");
  assert.match(page, /Сейчас нет доступных миграций/);
  assert.match(page, /manualPlacement === "migration"/);
  assert.match(form, /useState\(true\)/);
  assert.match(form, /enqueueMigrationJobAction/);
  assert.doesNotMatch(form, /Textarea/);
});
