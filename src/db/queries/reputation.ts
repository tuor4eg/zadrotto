import "server-only";

import { and, asc, eq, isNotNull, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  authorProgress,
  authorAccessProfiles,
  authorTrust,
  authors,
  levelSettings,
  levelThresholds,
  trustActionRules,
  trustSettings,
  xpActionRules,
} from "@/db/schema";
import {
  DEFAULT_LEVEL_NAMES,
  DEFAULT_LEVEL_THRESHOLDS,
  DEFAULT_TRUST_ENABLED_BY_ACTION,
  DEFAULT_TRUST_BY_ACTION,
  DEFAULT_XP_BY_ACTION,
  REPUTATION_ACTION_CODES,
  type ReputationActionCode,
  type ReputationPreviewConfig,
  type ReputationPreviewDirection,
  type ReputationPreviewResult,
  type ReputationPreviewRow,
  type ReputationPreviewSort,
} from "@/lib/reputation/model";
import { historicalReputationFactsSql } from "@/lib/reputation/historical-sql";

export type ReputationConfiguration = ReputationPreviewConfig & {
  enabledAt: Date | null;
  maxLockedLevel: number;
  status: "disabled" | "initializing" | "enabled";
};

export type AuthorLevelProgress = {
  accessProfileName: string;
  currentLevel: number;
  currentLevelName: string;
  currentLevelXp: number;
  nextLevel: number | null;
  nextLevelXp: number | null;
  xpTotal: number;
};

export type PublicAuthorLevel = {
  level: number;
  name: string;
};

export async function getPublicAuthorLevel(authorId: number): Promise<PublicAuthorLevel | null> {
  const [system] = await db
    .select({ status: levelSettings.status })
    .from(levelSettings)
    .where(eq(levelSettings.id, 1))
    .limit(1);
  if (system?.status !== "enabled") return null;

  const [level] = await db
    .select({ level: levelThresholds.level, name: levelThresholds.name })
    .from(levelThresholds)
    .leftJoin(authorProgress, eq(authorProgress.authorId, authorId))
    .where(eq(levelThresholds.level, sql<number>`coalesce(${authorProgress.currentLevel}, 1)`))
    .limit(1);

  return level ?? null;
}

export async function getAuthorLevelProgress(authorId: number): Promise<AuthorLevelProgress | null> {
  const [system] = await db
    .select({ status: levelSettings.status })
    .from(levelSettings)
    .where(eq(levelSettings.id, 1))
    .limit(1);
  if (system?.status !== "enabled") return null;

  const [progressRows, thresholds, profileRows] = await Promise.all([
    db
      .select({ currentLevel: authorProgress.currentLevel, xpTotal: authorProgress.xpTotal })
      .from(authorProgress)
      .where(eq(authorProgress.authorId, authorId))
      .limit(1),
    db
      .select({ level: levelThresholds.level, name: levelThresholds.name, xpThreshold: levelThresholds.xpThreshold })
      .from(levelThresholds)
      .orderBy(asc(levelThresholds.level)),
    db
      .select({ accessProfileName: authorAccessProfiles.name })
      .from(authors)
      .innerJoin(authorAccessProfiles, eq(authorAccessProfiles.id, authors.accessProfileId))
      .where(eq(authors.id, authorId))
      .limit(1),
  ]);
  const progress = progressRows[0] ?? { currentLevel: 1, xpTotal: 0 };
  const currentThreshold = thresholds.find((item) => item.level === progress.currentLevel);
  const nextThreshold = thresholds.find((item) => item.level > progress.currentLevel);
  const profile = profileRows[0];

  return {
    accessProfileName: profile?.accessProfileName ?? "—",
    currentLevel: progress.currentLevel,
    currentLevelName: currentThreshold?.name ?? `Уровень ${progress.currentLevel}`,
    currentLevelXp: currentThreshold?.xpThreshold ?? 0,
    nextLevel: nextThreshold?.level ?? null,
    nextLevelXp: nextThreshold?.xpThreshold ?? null,
    xpTotal: progress.xpTotal,
  };
}

function defaultConfig(): ReputationPreviewConfig {
  return {
    levels: DEFAULT_LEVEL_THRESHOLDS.map((xpThreshold, index) => ({
      level: index + 1,
      name: DEFAULT_LEVEL_NAMES[index] ?? `Уровень ${index + 1}`,
      xpThreshold,
    })),
    rules: REPUTATION_ACTION_CODES.map((actionCode) => ({
      actionCode,
      countsTowardTrust: DEFAULT_TRUST_ENABLED_BY_ACTION[actionCode],
      trustPoints: DEFAULT_TRUST_BY_ACTION[actionCode],
      xp: DEFAULT_XP_BY_ACTION[actionCode],
    })),
    trusted: {
      approvalRatePercent: 90,
      autoPromotionEnabled: true,
      historyDays: 14,
      level: 5,
      trustPoints: 5,
    },
  };
}

export async function getReputationConfiguration(): Promise<ReputationConfiguration> {
  const [levelRows, xpRows, trustRows, settingsRows, trustSettingsRows] = await Promise.all([
    db.select({ level: levelThresholds.level, name: levelThresholds.name, xpThreshold: levelThresholds.xpThreshold })
      .from(levelThresholds).orderBy(asc(levelThresholds.level)),
    db.select({ actionCode: xpActionRules.actionCode, xp: xpActionRules.xp })
      .from(xpActionRules).orderBy(asc(xpActionRules.displayOrder)),
    db.select({
      actionCode: trustActionRules.actionCode,
      countsTowardTrust: trustActionRules.countsTowardTrust,
      trustPoints: trustActionRules.trustPoints,
    }).from(trustActionRules).orderBy(asc(trustActionRules.displayOrder)),
    db.select().from(levelSettings).where(eq(levelSettings.id, 1)).limit(1),
    db.select().from(trustSettings).where(eq(trustSettings.id, 1)).limit(1),
  ]);
  const fallback = defaultConfig();
  const xpByCode = new Map(xpRows.map((row) => [row.actionCode, row.xp]));
  const trustByCode = new Map(trustRows.map((row) => [row.actionCode, row]));
  const system = settingsRows[0];
  const trusted = trustSettingsRows[0];
  return {
    levels: levelRows.length > 0 ? levelRows : fallback.levels,
    rules: REPUTATION_ACTION_CODES.map((actionCode) => ({
      actionCode,
      xp: xpByCode.get(actionCode) ?? fallback.rules.find((rule) => rule.actionCode === actionCode)!.xp,
      trustPoints: trustByCode.get(actionCode)?.trustPoints ?? DEFAULT_TRUST_BY_ACTION[actionCode],
      countsTowardTrust: trustByCode.get(actionCode)?.countsTowardTrust ?? DEFAULT_TRUST_ENABLED_BY_ACTION[actionCode],
    })),
    trusted: trusted ? {
      approvalRatePercent: trusted.minimumApprovalRatePercent,
      autoPromotionEnabled: trusted.autoPromotionEnabled,
      historyDays: trusted.minimumHistoryDays,
      level: trusted.minimumLevel,
      trustPoints: trusted.minimumTrustPoints,
    } : fallback.trusted,
    enabledAt: system?.enabledAt ?? null,
    maxLockedLevel: system?.maxLockedLevel ?? 0,
    status: system?.status ?? "disabled",
  };
}

function buildValues(config: ReputationPreviewConfig) {
  const ruleRows = config.rules.map((rule) => sql`(
    ${rule.actionCode}::text,
    ${rule.xp}::int,
    ${rule.trustPoints}::int,
    ${rule.countsTowardTrust}::boolean
  )`);
  const levelRows = config.levels.map((level) => sql`(${level.level}::int, ${level.xpThreshold}::int)`);
  return {
    levels: sql.join(levelRows, sql`, `),
    rules: sql.join(ruleRows, sql`, `),
  };
}

function buildPreviewCte(config: ReputationPreviewConfig): SQL {
  const values = buildValues(config);
  return sql`
    with rule_config(action_code, xp, trust_points, counts_toward_trust) as (
      values ${values.rules}
    ), level_config(level, xp_threshold) as (
      values ${values.levels}
    ), actions as (
      select facts.*, 1::int as action_count
      from (${historicalReputationFactsSql()}) facts
    ), author_metrics as (
      select authors.id as author_id, authors.code as author_code, authors.name as author_name,
        coalesce(sum(actions.action_count) filter (where actions.action_code = 'rating.created' and actions.outcome <> 'rejected'), 0)::int as ratings,
        coalesce(sum(actions.action_count) filter (where actions.action_code = 'media.published' and actions.outcome <> 'rejected'), 0)::int as media_items,
        coalesce(sum(actions.action_count) filter (where actions.action_code = 'series.created-with-link.published' and actions.outcome <> 'rejected'), 0)::int as created_series,
        coalesce(sum(actions.action_count) filter (where actions.action_code = 'series.link-existing.published' and actions.outcome <> 'rejected'), 0)::int as linked_series,
        coalesce(sum(actions.action_count) filter (where actions.action_code = 'series.link-removal.published' and actions.outcome <> 'rejected'), 0)::int as removed_series_links,
        coalesce(sum(actions.action_count) filter (where actions.action_code = 'review.published' and actions.outcome <> 'rejected'), 0)::int as reviews,
        coalesce(sum(actions.action_count) filter (where actions.action_code = 'bug-report.confirmed' and actions.outcome <> 'rejected'), 0)::int as bug_reports,
        coalesce(sum(actions.action_count * rules.xp) filter (where actions.outcome <> 'rejected'), 0)::int as xp,
        coalesce(sum(actions.action_count * rules.trust_points) filter (where rules.counts_toward_trust and actions.outcome <> 'rejected'), 0)::int as trust_points,
        coalesce(sum(actions.action_count) filter (where rules.counts_toward_trust and actions.outcome <> 'rejected'), 0)::int as successful_outcomes,
        coalesce(sum(actions.action_count) filter (where rules.counts_toward_trust and actions.outcome = 'rejected'), 0)::int as rejected_outcomes,
        min(actions.occurred_at) filter (where rules.counts_toward_trust) as first_qualifying_action_at
      from authors
      left join actions on actions.author_id = authors.id
      left join rule_config rules on rules.action_code = actions.action_code
      where authors.is_system = false
      group by authors.id, authors.code, authors.name
    ), calculated as (
      select metrics.*,
        coalesce((select max(level) from level_config where xp_threshold <= metrics.xp), 1)::int as level,
        case when metrics.successful_outcomes + metrics.rejected_outcomes = 0 then null
          else round(metrics.successful_outcomes * 100.0 / (metrics.successful_outcomes + metrics.rejected_outcomes), 2) end as approval_rate,
        case when metrics.first_qualifying_action_at is null then 0
          else greatest(0, floor(extract(epoch from (now() - metrics.first_qualifying_action_at)) / 86400))::int end as history_days
      from author_metrics metrics
    ), eligible as (
      select calculated.*,
        (${config.trusted.autoPromotionEnabled}
          and calculated.level >= ${config.trusted.level}
          and calculated.trust_points >= ${config.trusted.trustPoints}
          and coalesce(calculated.approval_rate, 0) >= ${config.trusted.approvalRatePercent}
          and calculated.history_days >= ${config.trusted.historyDays}
        ) as would_become_trusted
      from calculated
    )`;
}

const SORT_SQL: Record<ReputationPreviewSort, SQL> = {
  author: sql`lower(author_name)`,
  xp: sql`xp`,
  level: sql`level`,
  trust: sql`trust_points`,
  approvalRate: sql`coalesce(approval_rate, -1)`,
};

function rowFromRecord(row: Record<string, unknown>): ReputationPreviewRow {
  return {
    approvalRate: row.approvalRate === null ? null : Number(row.approvalRate),
    authorCode: String(row.authorCode),
    authorId: Number(row.authorId),
    authorName: String(row.authorName),
    bugReports: Number(row.bugReports),
    createdSeries: Number(row.createdSeries),
    firstQualifyingActionAt: row.firstQualifyingActionAt ? new Date(String(row.firstQualifyingActionAt)).toISOString() : null,
    historyDays: Number(row.historyDays),
    level: Number(row.level),
    linkedSeries: Number(row.linkedSeries),
    mediaItems: Number(row.mediaItems),
    ratings: Number(row.ratings),
    rejectedOutcomes: Number(row.rejectedOutcomes),
    removedSeriesLinks: Number(row.removedSeriesLinks),
    reviews: Number(row.reviews),
    successfulOutcomes: Number(row.successfulOutcomes),
    trustPoints: Number(row.trustPoints),
    wouldBecomeTrusted: Boolean(row.wouldBecomeTrusted),
    xp: Number(row.xp),
  };
}

export async function getReputationPreview(input: {
  config: ReputationPreviewConfig;
  cursor?: { authorId: number; value: number | string } | null;
  direction?: ReputationPreviewDirection;
  level?: number | null;
  onlyCandidates?: boolean;
  pageSize?: 25 | 50;
  sort?: ReputationPreviewSort;
}): Promise<ReputationPreviewResult> {
  const cte = buildPreviewCte(input.config);
  const sort = input.sort ?? "xp";
  const direction = input.direction ?? "desc";
  const sortExpression = SORT_SQL[sort];
  const comparison = direction === "asc" ? sql`>` : sql`<`;
  const cursorCondition = input.cursor
    ? sql`and ((${sortExpression}) ${comparison} ${input.cursor.value} or ((${sortExpression}) = ${input.cursor.value} and author_id ${comparison} ${input.cursor.authorId}))`
    : sql``;
  const levelCondition = input.level ? sql`and level = ${input.level}` : sql``;
  const candidateCondition = input.onlyCandidates ? sql`and would_become_trusted = true` : sql``;
  const orderDirection = direction === "asc" ? sql`asc` : sql`desc`;
  const pageSize = input.pageSize ?? 25;

  const [summaryResult, rowResult] = await Promise.all([
    db.execute(sql`${cte}
      select
        count(*)::int as "authorsCount",
        coalesce(max(xp), 0)::int as "maxXp",
        coalesce(max(level), 1)::int as "maxLevel",
        coalesce(round(avg(level)::numeric, 2), 0) as "averageLevel",
        coalesce(percentile_cont(0.5) within group (order by level), 0) as "medianLevel",
        count(*) filter (where would_become_trusted)::int as "candidatesCount",
        count(*) filter (where first_qualifying_action_at is null or history_days < ${input.config.trusted.historyDays})::int as "insufficientHistoryCount",
        (select coalesce(json_agg(item order by item.level), '[]'::json) from (
          select level, count(*)::int as authors from eligible group by level
        ) item) as "levelDistribution",
        (select coalesce(json_agg(item order by item.points), '[]'::json) from (
          select trust_points as points, count(*)::int as authors from eligible group by trust_points
        ) item) as "trustDistribution"
      from eligible`),
    db.execute(sql`${cte}
      select author_id as "authorId", author_code as "authorCode", author_name as "authorName",
        ratings, media_items as "mediaItems", created_series as "createdSeries", linked_series as "linkedSeries",
        removed_series_links as "removedSeriesLinks", reviews, bug_reports as "bugReports", xp, level,
        trust_points as "trustPoints",
        successful_outcomes as "successfulOutcomes", rejected_outcomes as "rejectedOutcomes",
        approval_rate as "approvalRate", history_days as "historyDays",
        first_qualifying_action_at as "firstQualifyingActionAt", would_become_trusted as "wouldBecomeTrusted"
      from eligible where true ${levelCondition} ${candidateCondition} ${cursorCondition}
      order by ${sortExpression} ${orderDirection}, author_id ${orderDirection}
      limit ${pageSize + 1}`),
  ]);

  const summaryRow = Array.from(summaryResult as Iterable<Record<string, unknown>>)[0] ?? {};
  const records = Array.from(rowResult as Iterable<Record<string, unknown>>);
  const hasMore = records.length > pageSize;
  const rows = records.slice(0, pageSize).map(rowFromRecord);
  const last = rows.at(-1);
  const cursorValue = last ? ({
    author: last.authorName.toLocaleLowerCase("ru"),
    xp: last.xp,
    level: last.level,
    trust: last.trustPoints,
    approvalRate: last.approvalRate ?? -1,
  } satisfies Record<ReputationPreviewSort, number | string>)[sort] : null;

  return {
    hasMore,
    nextCursor: hasMore && last ? { authorId: last.authorId, value: cursorValue! } : null,
    rows,
    summary: {
      authorsCount: Number(summaryRow.authorsCount ?? 0),
      averageLevel: Number(summaryRow.averageLevel ?? 0),
      candidatesCount: Number(summaryRow.candidatesCount ?? 0),
      calculatedAt: new Date().toISOString(),
      insufficientHistoryCount: Number(summaryRow.insufficientHistoryCount ?? 0),
      levelDistribution: (summaryRow.levelDistribution ?? []) as Array<{ authors: number; level: number }>,
      maxLevel: Number(summaryRow.maxLevel ?? 1),
      maxXp: Number(summaryRow.maxXp ?? 0),
      medianLevel: Number(summaryRow.medianLevel ?? 0),
      trustDistribution: (summaryRow.trustDistribution ?? []) as Array<{ authors: number; points: number }>,
      warnings: [
        "Удаления связей, выполненные до появления доменных событий, восстановить невозможно.",
        "Старые записи без указанного автора не участвуют в расчёте.",
        "Для старых заявок без истории переходов учитывается текущий итоговый статус.",
        "Начальная связь старой пользовательской серии определяется по самой ранней авторской связи.",
      ],
    },
  };
}

export function assertValidReputationPreviewConfig(config: ReputationPreviewConfig) {
  const ruleCodes = new Set(config.rules.map((rule) => rule.actionCode));
  if (ruleCodes.size !== REPUTATION_ACTION_CODES.length || REPUTATION_ACTION_CODES.some((code) => !ruleCodes.has(code))) {
    throw new Error("invalid-rules");
  }
  if (config.rules.some((rule) => !Number.isSafeInteger(rule.xp) || rule.xp < 0
    || !Number.isSafeInteger(rule.trustPoints) || rule.trustPoints < 1)) {
    throw new Error("invalid-rules");
  }
  const levels = [...config.levels].sort((a, b) => a.level - b.level);
  if (levels.length === 0 || levels[0]?.level !== 1 || levels[0]?.xpThreshold !== 0
    || levels.some((level, index) => level.level !== index + 1
      || level.name.trim() !== level.name || level.name.length < 1 || level.name.length > 80
      || !Number.isSafeInteger(level.xpThreshold) || level.xpThreshold < 0)
    || levels.some((level, index) => index > 0 && level.xpThreshold <= levels[index - 1]!.xpThreshold)) {
    throw new Error("invalid-levels");
  }
  const trusted = config.trusted;
  if (!Number.isSafeInteger(trusted.level) || trusted.level < 1
    || !Number.isSafeInteger(trusted.trustPoints) || trusted.trustPoints < 1
    || !Number.isSafeInteger(trusted.approvalRatePercent) || trusted.approvalRatePercent < 0 || trusted.approvalRatePercent > 100
    || !Number.isSafeInteger(trusted.historyDays) || trusted.historyDays < 0) {
    throw new Error("invalid-trusted-settings");
  }
  return config;
}

export function getReputationRule(config: ReputationPreviewConfig, actionCode: ReputationActionCode) {
  return config.rules.find((rule) => rule.actionCode === actionCode);
}

export async function suppressAutomaticTrustOnManualDowngrade(authorId: number) {
  const [updated] = await db.update(authorTrust).set({
    autoTrustSuppressedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(authorTrust.authorId, authorId),
    isNotNull(authorTrust.autoTrustedAt),
  )).returning({ authorId: authorTrust.authorId });
  return updated ?? null;
}

export async function saveReputationConfiguration(input: {
  adminUserId: number;
  config: ReputationPreviewConfig;
}) {
  const config = assertValidReputationPreviewConfig(input.config);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(90420261)`);
    const [system] = await tx.select().from(levelSettings).where(eq(levelSettings.id, 1)).limit(1).for("update");
    if (!system || system.status === "initializing") throw new Error("initializing");
    const existingLevels = await tx.select().from(levelThresholds).orderBy(asc(levelThresholds.level));
    for (const existing of existingLevels) {
      if (existing.level > system.maxLockedLevel) continue;
      const requested = config.levels.find((item) => item.level === existing.level);
      if (!requested || requested.xpThreshold !== existing.xpThreshold) throw new Error("locked-level");
    }
    const now = new Date();
    for (const [index, rule] of config.rules.entries()) {
      await tx.insert(xpActionRules).values({ actionCode: rule.actionCode, displayOrder: (index + 1) * 10, xp: rule.xp })
        .onConflictDoUpdate({ target: xpActionRules.actionCode, set: { xp: rule.xp, displayOrder: (index + 1) * 10, updatedAt: now } });
      await tx.insert(trustActionRules).values({
        actionCode: rule.actionCode,
        countsTowardTrust: rule.countsTowardTrust,
        displayOrder: (index + 1) * 10,
        trustPoints: rule.trustPoints,
      }).onConflictDoUpdate({ target: trustActionRules.actionCode, set: {
        countsTowardTrust: rule.countsTowardTrust,
        displayOrder: (index + 1) * 10,
        trustPoints: rule.trustPoints,
        updatedAt: now,
      } });
    }
    await tx.delete(levelThresholds).where(sql`${levelThresholds.level} > ${system.maxLockedLevel}`);
    for (const level of config.levels.filter((item) => item.level <= system.maxLockedLevel)) {
      await tx.update(levelThresholds).set({ name: level.name, updatedAt: now })
        .where(eq(levelThresholds.level, level.level));
    }
    const editableLevels = config.levels.filter((item) => item.level > system.maxLockedLevel);
    if (editableLevels.length > 0) await tx.insert(levelThresholds).values(editableLevels);
    await tx.update(trustSettings).set({
      autoPromotionEnabled: config.trusted.autoPromotionEnabled,
      minimumApprovalRatePercent: config.trusted.approvalRatePercent,
      minimumHistoryDays: config.trusted.historyDays,
      minimumLevel: config.trusted.level,
      minimumTrustPoints: config.trusted.trustPoints,
      updatedAt: now,
      updatedByAdminId: input.adminUserId,
    }).where(eq(trustSettings.id, 1));
    await tx.update(levelSettings).set({ updatedAt: now, updatedByAdminId: input.adminUserId }).where(eq(levelSettings.id, 1));
    await tx.execute(sql`
      update author_progress progress set
        current_level = greatest(progress.current_level, coalesce((
          select max(level) from level_thresholds where xp_threshold <= progress.xp_total
        ), 1)),
        max_achieved_level = greatest(progress.max_achieved_level, coalesce((
          select max(level) from level_thresholds where xp_threshold <= progress.xp_total
        ), 1)),
        updated_at = now()
    `);
    await tx.execute(sql`
      update level_settings set max_locked_level = greatest(
        max_locked_level, coalesce((select max(max_achieved_level) from author_progress), 0)
      ), updated_at = now() where id = 1
    `);
    return { status: system.status };
  });
}

export async function setReputationSystemStatus(status: "disabled" | "initializing") {
  const [updated] = await db.update(levelSettings).set({ status, updatedAt: new Date() })
    .where(eq(levelSettings.id, 1)).returning({ status: levelSettings.status });
  return updated ?? null;
}

export async function beginReputationInitialization() {
  const [updated] = await db.update(levelSettings).set({ status: "initializing", updatedAt: new Date() })
    .where(and(
      eq(levelSettings.id, 1),
      sql`${levelSettings.status} <> 'initializing'`,
    )).returning({ status: levelSettings.status });
  return updated ?? null;
}
