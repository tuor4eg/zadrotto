import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("src/db/schema.ts", "utf8");
const migration = readFileSync("drizzle/0080_archive_exploration_settings.sql", "utf8");
const onboardingMigration = readFileSync("drizzle/0081_archive_exploration_onboarding.sql", "utf8");
const onboardingStepMigration = readFileSync(
  "drizzle/0082_archive_exploration_onboarding_step.sql",
  "utf8",
);
const catalogControls = readFileSync("src/app/catalog-header-controls.tsx", "utf8");
const mainPage = readFileSync("src/app/page.tsx", "utf8");

test("archive exploration settings table remains in schema and migrations", () => {
  assert.match(schema, /authorArchiveExplorationSettings = pgTable/);
  assert.match(schema, /autoShowEnabled:[\s\S]*default\(true\)/);
  assert.match(schema, /lastAutoShownAt: timestamp/);
  assert.match(schema, /onboardingStep: integer\("onboarding_step"\)\.default\(10\)\.notNull\(\)/);
  assert.match(onboardingMigration, /ADD COLUMN "interests_selected_at" timestamp with time zone/);
  assert.match(onboardingMigration, /ADD COLUMN "onboarding_completed_at" timestamp with time zone/);
  assert.match(
    onboardingStepMigration,
    /ADD COLUMN IF NOT EXISTS "onboarding_step" integer DEFAULT 10 NOT NULL/,
  );
  assert.match(onboardingStepMigration, /CHECK \("onboarding_step" BETWEEN 10 AND 100\)/);
  assert.match(onboardingStepMigration, /DROP COLUMN IF EXISTS "interests_selected_at"/);
  assert.match(onboardingStepMigration, /DROP COLUMN IF EXISTS "onboarding_completed_at"/);
  assert.match(migration, /ON DELETE cascade/);
});

test("current archive exploration UI and unused queries are gone", () => {
  assert.equal(existsSync("src/components/archive/archive-exploration-launcher.tsx"), false);
  assert.equal(existsSync("src/app/archive-exploration/actions.ts"), false);
  assert.equal(existsSync("src/db/queries/archive-exploration.ts"), false);
  assert.equal(existsSync("src/lib/archive-exploration/model.ts"), false);
  assert.doesNotMatch(catalogControls, /ArchiveExplorationLauncher/);
  assert.doesNotMatch(mainPage, /ArchiveExplorationLauncher/);
});
