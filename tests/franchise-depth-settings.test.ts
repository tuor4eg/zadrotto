import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("src/db/schema.ts", "utf8");
const migration = readFileSync("drizzle/0040_archive_settings_franchise_depth.sql", "utf8");
const settingsQuery = readFileSync("src/db/queries/archive-settings.ts", "utf8");
const franchiseQuery = readFileSync("src/db/queries/franchises.ts", "utf8");
const settingsNav = readFileSync("src/app/admin/(protected)/settings/settings-nav.tsx", "utf8");
const settingsRoot = readFileSync("src/app/admin/(protected)/settings/page.tsx", "utf8");
const adminNav = readFileSync("src/app/admin/(protected)/admin-nav-menu.tsx", "utf8");
const generalSettings = readFileSync("src/app/admin/(protected)/settings/general/page.tsx", "utf8");
const settingsForm = readFileSync("src/app/admin/(protected)/settings/archive/archive-settings-form.tsx", "utf8");
const seriesActions = readFileSync("src/app/admin/(protected)/series/actions.ts", "utf8");
const seriesMessages = readFileSync("src/app/admin/(protected)/series/messages.ts", "utf8");

test("stores and exposes the global franchise depth setting", () => {
  assert.match(schema, /maxFranchiseDepth: integer\("max_franchise_depth"\)\.default\(3\)\.notNull\(\)/);
  assert.match(schema, /archive_settings_max_franchise_depth_check[\s\S]*maxFranchiseDepth\} between 2 and 5/);
  assert.match(migration, /WITH RECURSIVE franchise_depths AS/);
  assert.match(migration, /existing hierarchy depth % exceeds supported maximum 5/);
  assert.match(migration, /ADD COLUMN "max_franchise_depth" integer/);
  assert.match(migration, /SET "max_franchise_depth" = GREATEST\(3, COALESCE\(\(SELECT MAX\(depth\) FROM franchise_depths\), 1\)\)/);
  assert.match(migration, /ALTER COLUMN "max_franchise_depth" SET DEFAULT 3/);
  assert.match(migration, /ALTER COLUMN "max_franchise_depth" SET NOT NULL/);
  assert.match(migration, /CHECK \("max_franchise_depth" BETWEEN 2 AND 5\)/);
  assert.match(settingsQuery, /maxFranchiseDepth: archiveSettings\.maxFranchiseDepth/);
  assert.match(settingsQuery, /maxFranchiseDepth < currentMaxDepth/);
});

test("enforces depth for both new series and moved subtrees", () => {
  const createStart = franchiseQuery.indexOf("export async function createFranchise");
  const updateStart = franchiseQuery.indexOf("export async function updateFranchise");
  const deleteStart = franchiseQuery.indexOf("export async function deleteFranchiseIfEmpty");
  const create = franchiseQuery.slice(createStart, updateStart);
  const update = franchiseQuery.slice(updateStart, deleteStart);

  assert.match(create, /depth > settings\.maxFranchiseDepth/);
  assert.match(create, /throw new Error\("franchise-depth-limit"\)/);
  assert.match(update, /targetDepth \+ height\(input\.id\) - 1 > maxFranchiseDepth/);
  assert.match(update, /throw new Error\("franchise-depth-limit"\)/);
  assert.match(seriesActions, /getFranchiseMutationErrorCode/);
  assert.match(seriesMessages, /error === "franchise-depth-limit"/);
});

test("makes general settings the first settings destination", () => {
  assert.match(settingsNav, /href: "\/admin\/settings\/general",[\s\S]*label: "Общие"/);
  assert.match(settingsRoot, /redirect\("\/admin\/settings\/general"\)/);
  assert.match(adminNav, /href: "\/admin\/settings\/general", icon: Settings, label: "Настройки"/);
  assert.match(generalSettings, /title="Общие"/);
  assert.match(settingsForm, /Максимальная глубина серий/);
  assert.match(settingsForm, /Marvel → Avengers → Spider-Man — глубина 3/);
});
