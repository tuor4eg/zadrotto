import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ARCHIVE_EXPLORATION_MIN_AVERAGE_SCORE,
  ARCHIVE_EXPLORATION_RATING_LIMIT,
} from "@/lib/archive-exploration/model";

const schema = readFileSync("src/db/schema.ts", "utf8");
const migration = readFileSync("drizzle/0080_archive_exploration_settings.sql", "utf8");
const onboardingMigration = readFileSync("drizzle/0081_archive_exploration_onboarding.sql", "utf8");
const onboardingStepMigration = readFileSync("drizzle/0082_archive_exploration_onboarding_step.sql", "utf8");
const query = readFileSync("src/db/queries/archive-exploration.ts", "utf8");
const actions = readFileSync("src/app/archive-exploration/actions.ts", "utf8");
const launcher = readFileSync("src/components/archive/archive-exploration-launcher.tsx", "utf8");
const mainPage = readFileSync("src/app/page.tsx", "utf8");
const catalogControls = readFileSync("src/app/catalog-header-controls.tsx", "utf8");

test("archive exploration keeps product thresholds in one source", () => {
  assert.equal(ARCHIVE_EXPLORATION_RATING_LIMIT, 5);
  assert.equal(ARCHIVE_EXPLORATION_MIN_AVERAGE_SCORE, 80);
});

test("archive exploration persists one cross-device invitation setting per author", () => {
  assert.match(schema, /authorArchiveExplorationSettings = pgTable/);
  assert.match(schema, /autoShowEnabled:[\s\S]*default\(true\)/);
  assert.match(schema, /lastAutoShownAt: timestamp/);
  assert.match(schema, /onboardingStep: integer\("onboarding_step"\)\.default\(10\)\.notNull\(\)/);
  assert.match(onboardingMigration, /ADD COLUMN "interests_selected_at" timestamp with time zone/);
  assert.match(onboardingMigration, /ADD COLUMN "onboarding_completed_at" timestamp with time zone/);
  assert.match(onboardingStepMigration, /ADD COLUMN IF NOT EXISTS "onboarding_step" integer DEFAULT 10 NOT NULL/);
  assert.match(onboardingStepMigration, /CHECK \("onboarding_step" BETWEEN 10 AND 100\)/);
  assert.match(onboardingStepMigration, /DROP COLUMN IF EXISTS "interests_selected_at"/);
  assert.match(onboardingStepMigration, /DROP COLUMN IF EXISTS "onboarding_completed_at"/);
  assert.match(migration, /ON DELETE cascade/);
});

test("daily invitation claim is atomic and bounded to the rating limit and 24 hours", () => {
  assert.match(query, /INSERT INTO \$\{authorArchiveExplorationSettings\}[\s\S]*ON CONFLICT/);
  assert.match(query, /LIMIT \$\{ARCHIVE_EXPLORATION_RATING_LIMIT\}/);
  assert.match(query, /interval '24 hours'/);
  assert.match(query, /RETURNING[\s\S]*auto_show_enabled/);
});

test("candidate query uses quality stats, exclusions and indexed wraparound", () => {
  assert.match(query, /scoreSum}[\s\S]*ratingsCount}[\s\S]*ARCHIVE_EXPLORATION_MIN_AVERAGE_SCORE/);
  assert.match(query, /not\(exists[\s\S]*ratings\.authorId/);
  assert.match(query, /not\(exists[\s\S]*authorMediaStatuses\.authorId/);
  assert.match(query, /gte\(mediaItemRatingStats\.mediaItemId, pivot\)/);
  assert.match(query, /lt\(mediaItemRatingStats\.mediaItemId, pivot\)/);
  assert.doesNotMatch(query, /orderBy\(sql`random\(\)`/);
  assert.match(query, /for \(const mediaTypeCode of orderedMediaTypeCodes\)/);
});

test("exploration actions reuse rating events and regular media statuses", () => {
  assert.match(actions, /upsertAuthorRating/);
  assert.match(actions, /upsertAuthorMediaExperience/);
  assert.match(actions, /parseFirstExperiencedInput/);
  assert.match(actions, /setAuthorMediaStatus/);
  assert.match(actions, /ratingsCount >= ARCHIVE_EXPLORATION_RATING_LIMIT/);
  assert.match(actions, /getRotatedMediaTypeCodes/);
  assert.match(actions, /currentTypeIndex \+ 1/);
  assert.match(actions, /saveAuthorMediaTypeOverrides/);
  assert.match(actions, /getArchiveExplorationOnboardingStep/);
  assert.match(actions, /advanceArchiveExplorationOnboardingStep/);
});

test("main auto-invites while main and catalog keep manual launchers beside search", () => {
  assert.match(mainPage, /<MainArchiveSearch[\s\S]*<ArchiveExplorationLauncher[\s\S]*autoInvite/);
  assert.match(catalogControls, /header-catalog-search[\s\S]*<ArchiveExplorationLauncher[\s\S]*openSelect === "filters"/);
  assert.match(launcher, /Больше не показывать автоматически/);
  assert.match(launcher, /src="\/mascot\/deadz_hello\.webp"/);
  assert.match(launcher, /Что тебе интересно\?/);
  assert.match(launcher, /Позже выбор можно изменить[\s\S]*в настройках профиля/);
  assert.match(launcher, /saveArchiveExplorationMediaTypesAction/);
  assert.match(launcher, /Сейчас покажем, как ставить оценки/);
  assert.match(launcher, /src="\/mascot\/deadz_quiz_correct\.webp"/);
  assert.match(launcher, /role="progressbar"/);
  assert.match(launcher, /style=\{\{ right: 0, top: 0 \}\}/);
  assert.match(launcher, /Исследовать архив<\/h2>[\s\S]*role="progressbar"/);
  assert.match(launcher, /aria-valuenow=\{result\.ratingsCount\}/);
  assert.match(launcher, /result\.ratingsCount \/ ARCHIVE_EXPLORATION_RATING_LIMIT/);
  assert.match(launcher, /linear-gradient\(to_right,#b91c1c/);
  assert.match(launcher, /grid grid-cols-5/);
  assert.match(launcher, /length: ARCHIVE_EXPLORATION_RATING_LIMIT/);
  assert.match(launcher, /из \{ARCHIVE_EXPLORATION_RATING_LIMIT\}/);
  assert.match(launcher, /if \(showInvitation \|\| showMediaTypeSelection\)[\s\S]*setIsOpen\(true\)[\s\S]*return/);
  assert.match(launcher, /В желаемое/);
  assert.match(launcher, /Пропустить/);
  assert.match(launcher, /buttonVariants\(\{ variant: "outline", size: "sm" \}\)/);
  assert.match(launcher, /<ArchiveRatingPanel/);
  assert.match(launcher, /<ImageViewer/);
  assert.match(launcher, /overlayZIndex=\{120\}/);
  assert.match(launcher, /showStarsWhenCompact/);
  assert.match(launcher, /inverted/);
  assert.match(launcher, /selectedScore=\{selectedScore\}/);
  assert.match(launcher, /Дальше/);
  assert.match(launcher, /<RatingExperienceFields/);
  assert.match(launcher, /Сейчас всё исследовано/);
  assert.match(launcher, /result\?\.status === "graduated"/);
  assert.match(launcher, /Теперь ты знаешь, как приручить архив/);
  assert.match(launcher, /<AuthorLoginModal/);
  assert.match(launcher, /isLoginOpen && typeof document !== "undefined"[\s\S]*createPortal\([\s\S]*<AuthorLoginModal/);
  assert.match(launcher, /createPortal\([\s\S]*document\.body/);
});
