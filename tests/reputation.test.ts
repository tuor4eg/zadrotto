import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_LEVEL_NAMES,
  DEFAULT_LEVEL_THRESHOLDS,
  DEFAULT_TRUST_ENABLED_BY_ACTION,
  DEFAULT_TRUST_BY_ACTION,
  DEFAULT_XP_BY_ACTION,
  REPUTATION_ACTION_CODES,
  REPUTATION_ACTION_LABELS,
} from "../src/lib/reputation/model";

const migration = readFileSync("drizzle/0098_author_levels_trust.sql", "utf8");
const levelNamesMigration = readFileSync("drizzle/0099_level_names.sql", "utf8");
const simplifiedTrustMigration = readFileSync("drizzle/0100_simplify_author_trust.sql", "utf8");
const unifiedTrustMigration = readFileSync("drizzle/0101_unify_trust_action_accounting.sql", "utf8");
const trustedPromotionMigration = readFileSync("drizzle/0102_reputation_trusted_promotion_job.sql", "utf8");
const jobHandlers = readFileSync("src/lib/jobs/handlers.ts", "utf8");
const schema = readFileSync("src/db/schema.ts", "utf8");
const consumer = readFileSync("src/lib/reputation/service.ts", "utf8");
const initializer = readFileSync("src/lib/reputation/initialize.ts", "utf8");
const preview = readFileSync("src/db/queries/reputation.ts", "utf8");
const previewAction = readFileSync("src/app/admin/(protected)/reputation/actions.ts", "utf8");
const previewUi = readFileSync("src/app/admin/(protected)/reputation/reputation-settings.tsx", "utf8");
const reputationIndex = readFileSync("src/app/admin/(protected)/reputation/page.tsx", "utf8");
const reputationLayout = readFileSync("src/app/admin/(protected)/reputation/layout.tsx", "utf8");
const reputationNav = readFileSync("src/app/admin/(protected)/reputation/reputation-nav.tsx", "utf8");

test("reputation defaults keep progress and trust independently configurable", () => {
  assert.deepEqual(DEFAULT_LEVEL_THRESHOLDS, [0, 20, 60, 120, 220, 350, 550, 800, 1150, 1550]);
  assert.deepEqual(DEFAULT_LEVEL_NAMES, [
    "Новичок с мануалом", "Искатель пасхалок", "Укротитель бэклога", "Хранитель канона",
    "Повелитель спойлеров", "Архивариус мультивселенной", "Босс секретного уровня",
    "Легенда локального кооператива", "Финальный коллекционер", "Хранитель Гикотеки",
  ]);
  assert.equal(DEFAULT_XP_BY_ACTION["rating.created"], 1);
  assert.equal(REPUTATION_ACTION_LABELS["rating.created"], "Новая оценка записи");
  assert.equal(DEFAULT_XP_BY_ACTION["series.created-with-link.published"], 4);
  assert.equal(DEFAULT_XP_BY_ACTION["review.published"], 10);
  assert.equal(DEFAULT_TRUST_BY_ACTION["rating.created"], 1);
  assert.equal(DEFAULT_TRUST_ENABLED_BY_ACTION["rating.created"], false);
  assert.equal(DEFAULT_TRUST_ENABLED_BY_ACTION["media.published"], true);
  assert.equal(DEFAULT_TRUST_ENABLED_BY_ACTION["review.published"], false);
  assert.equal(new Set(REPUTATION_ACTION_CODES).size, REPUTATION_ACTION_CODES.length);
});

test("schema separates author progress and author trust and keeps an auditable ledger", () => {
  for (const table of [
    "level_settings", "xp_action_rules", "level_thresholds", "author_progress",
    "trust_settings", "trust_action_rules", "author_trust", "author_action_ledger",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(migration, /author_action_ledger_reward_unique/);
  assert.match(migration, /entry_kind.*reward.*outcome/s);
  assert.match(migration, /job_runs_reputation_initialize_active_unique/);
  assert.match(schema, /authorProgress = pgTable\("author_progress"/);
  assert.match(schema, /authorTrust = pgTable\("author_trust"/);
  assert.match(levelNamesMigration, /ADD COLUMN "name" text/);
  assert.match(levelNamesMigration, /ALTER COLUMN "name" SET NOT NULL/);
  assert.match(levelNamesMigration, /level_thresholds_name_check/);
  assert.match(simplifiedTrustMigration, /ADD COLUMN "counts_toward_trust"/);
  assert.match(simplifiedTrustMigration, /DROP COLUMN "catalog_trust_points"/);
  assert.match(schema, /countsTowardTrust: boolean\("counts_toward_trust"\)/);
  assert.doesNotMatch(schema, /countsTowardApprovalRate/);
  assert.doesNotMatch(schema, /catalogTrustPoints/);
  assert.match(unifiedTrustMigration, /DROP COLUMN "counts_toward_approval_rate"/);
});

test("realtime awards are idempotent and initialization shares the system lock", () => {
  assert.match(consumer, /reward:\$\{rewardKey\}/);
  assert.match(consumer, /outcome:rejected:\$\{event\.id\}/);
  assert.match(consumer, /onConflictDoNothing/);
  assert.match(consumer, /countsTowardTrust \? trustRule\[0\]\.trustPoints : 0/);
  assert.match(consumer, /event\.occurredAt\.toISOString\(\)/);
  assert.match(consumer, /occurredAtIso\}::timestamptz/);
  assert.doesNotMatch(consumer, /firstQualifyingActionAt}, \$\{event\.occurredAt}/);
  assert.match(consumer, /lockReputationForConsumer/);
  assert.match(initializer, /pg_advisory_xact_lock/);
  assert.match(initializer, /on conflict \(idempotency_key\) do nothing/);
  assert.match(initializer, /case when trust\.counts_toward_trust then trust\.trust_points else 0 end/);
  assert.match(initializer, /status: "enabled"/);
  assert.match(consumer, /achievedLevel > previousLevel/);
  assert.match(consumer, /type: "author\.level-achieved"/);
  assert.match(consumer, /type: "author\.trusted-granted"/);
  assert.match(consumer, /followUpEventIds = \[levelEvent\.id\]/);
  assert.doesNotMatch(initializer, /author\.level-achieved/);
  assert.match(initializer, /author\.trusted-granted/);
  assert.match(consumer, /export async function promoteEligibleTrustedAuthors/);
  assert.match(jobHandlers, /type: "reputation\.promote-trusted"/);
  assert.match(trustedPromotionMigration, /'17 \* \* \* \*'/);
});

test("preview is read-only, validated and supports adaptive paginated results", () => {
  assert.match(preview, /export async function getReputationPreview/);
  assert.doesNotMatch(migration, /reputation_preview|preview_run/);
  assert.match(preview, /const SORT_SQL: Record<ReputationPreviewSort, SQL>/);
  assert.match(preview, /nextCursor/);
  assert.match(previewAction, /requireAdminUser/);
  assert.match(previewAction, /normalizePreviewConfig/);
  assert.match(previewUi, /Предпросмотр результатов/);
  assert.match(previewUi, /<ConfirmDialog/);
  assert.match(previewUi, /<AdminToasts messages=\{toast \? \[toast\] : \[\]\} \/>/);
  assert.doesNotMatch(previewUi, /message \? <p role="status"/);
  assert.match(previewUi, /Включить уровни и доверие\?/);
  assert.doesNotMatch(previewUi, /window\.confirm/);
  assert.match(previewUi, /lg:hidden/);
  assert.match(previewUi, /hidden overflow-x-auto lg:block/);
});

test("levels and trust are separate responsive admin subsections", () => {
  assert.match(reputationIndex, /redirect\("\/admin\/reputation\/levels"\)/);
  assert.match(reputationLayout, /lg:grid-cols-\[220px_minmax\(0,1fr\)\]/);
  assert.match(reputationNav, /\/admin\/reputation\/levels/);
  assert.match(reputationNav, /\/admin\/reputation\/trust/);
  assert.match(reputationNav, /overflow-x-auto/);
  assert.match(previewUi, /section === "levels"/);
  assert.match(previewUi, /section === "trust"/);
  assert.match(previewUi, /role="tablist" aria-label="Настройки уровней"/);
  assert.match(previewUi, /levelTab === "xp"/);
  assert.match(previewUi, /levelTab === "thresholds"/);
  assert.match(previewUi, /<TH className="w-32">Уровень<\/TH>/);
  assert.match(previewUi, /const isAchievedLocked = item\.level <= maxLockedLevel/);
  assert.match(previewUi, /const isThresholdLocked = item\.level === 1 \|\| isAchievedLocked/);
  assert.match(previewUi, /Названия можно менять в любое время/);
  assert.doesNotMatch(previewUi, /disabled=\{isAchievedLocked\}/);
  assert.match(previewUi, /Порог заблокирован/);
  assert.match(previewUi, /Сам по себе уровень не выдаёт никаких прав/);
  assert.match(previewUi, /успешные ÷ \(успешные \+ отклонённые\)/);
  assert.match(previewUi, /первого учитываемого действия автора/);
  assert.match(previewUi, /role="tablist" aria-label="Настройки доверия"/);
  assert.match(previewUi, /trustTab === "actions"/);
  assert.match(previewUi, /trustTab === "parameters"/);
  assert.match(previewUi, /Доверие за действия/);
  assert.match(previewUi, /Параметры Trusted/);
  assert.match(previewUi, /Как работает доверие/);
  assert.match(previewUi, /Учитывать в доверии/);
  assert.doesNotMatch(previewUi, /Учитывать в approval rate/);
  assert.match(previewUi, /Эти же действия формируют approval rate/);
  assert.match(previewUi, /Количество баллов всегда положительное — минимум 1/);
});

test("locked levels and trusted promotion rules are enforced", () => {
  assert.match(preview, /locked-level/);
  assert.match(preview, /requested\.xpThreshold !== existing\.xpThreshold/);
  assert.doesNotMatch(preview, /requested\.name !== existing\.name/);
  assert.match(consumer, /REGULAR_AUTHOR_ACCESS_PROFILE_CODE/);
  assert.match(consumer, /autoTrustSuppressedAt/);
  assert.match(consumer, /minimumApprovalRatePercent/);
});
