"use server";

import {
  assertValidReputationPreviewConfig,
  beginReputationInitialization,
  getReputationPreview,
  saveReputationConfiguration,
  setReputationSystemStatus,
} from "@/db/queries/reputation";
import { enqueueJobRun } from "@/lib/jobs/queue";
import { logActivity } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import {
  REPUTATION_ACTION_CODES,
  isReputationPreviewSort,
  type ReputationPreviewConfig,
  type ReputationPreviewDirection,
  type ReputationPreviewResult,
} from "@/lib/reputation/model";

export type ReputationPreviewActionInput = {
  config: ReputationPreviewConfig;
  cursor?: { authorId: number; value: number | string } | null;
  direction: ReputationPreviewDirection;
  level?: number | null;
  onlyCandidates: boolean;
  pageSize: 25 | 50;
  sort: string;
};

export type ReputationPreviewActionResult =
  | { data: ReputationPreviewResult; error: null }
  | { data: null; error: string };

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function normalizePreviewConfig(value: ReputationPreviewConfig): ReputationPreviewConfig | null {
  if (!value || !Array.isArray(value.levels) || !Array.isArray(value.rules) || !value.trusted) {
    return null;
  }

  if (value.levels.length === 0 || value.levels.length > 100) {
    return null;
  }

  let previousThreshold = -1;
  const levels = value.levels.map((item, index) => {
    if (
      !isIntegerInRange(item?.level, 1, 100) ||
      item.level !== index + 1 ||
      typeof item?.name !== "string" ||
      item.name.trim().length < 1 ||
      item.name.trim().length > 80 ||
      !isIntegerInRange(item?.xpThreshold, 0, 100_000_000) ||
      item.xpThreshold <= previousThreshold
    ) {
      return null;
    }
    previousThreshold = item.xpThreshold;
    return { level: item.level, name: item.name.trim(), xpThreshold: item.xpThreshold };
  });

  if (levels.some((item) => item === null) || levels[0]?.xpThreshold !== 0) {
    return null;
  }

  const rulesByCode = new Map(value.rules.map((rule) => [rule?.actionCode, rule]));
  if (rulesByCode.size !== REPUTATION_ACTION_CODES.length) {
    return null;
  }

  const rules = REPUTATION_ACTION_CODES.map((actionCode) => {
    const rule = rulesByCode.get(actionCode);
    if (
      !rule ||
      !isIntegerInRange(rule.xp, 0, 1_000_000) ||
      !isIntegerInRange(rule.trustPoints, 1, 1_000_000) ||
      typeof rule.countsTowardTrust !== "boolean"
    ) {
      return null;
    }
    return {
      actionCode,
      xp: rule.xp,
      trustPoints: rule.trustPoints,
      countsTowardTrust: rule.countsTowardTrust,
    };
  });

  const trusted = value.trusted;
  if (
    rules.some((item) => item === null) ||
    !isIntegerInRange(trusted.level, 1, value.levels.length) ||
    !isIntegerInRange(trusted.trustPoints, 1, 100_000_000) ||
    !isIntegerInRange(trusted.approvalRatePercent, 0, 100) ||
    !isIntegerInRange(trusted.historyDays, 0, 36_500) ||
    typeof trusted.autoPromotionEnabled !== "boolean"
  ) {
    return null;
  }

  return {
    levels: levels as ReputationPreviewConfig["levels"],
    rules: rules as ReputationPreviewConfig["rules"],
    trusted: {
      level: trusted.level,
      trustPoints: trusted.trustPoints,
      approvalRatePercent: trusted.approvalRatePercent,
      historyDays: trusted.historyDays,
      autoPromotionEnabled: trusted.autoPromotionEnabled,
    },
  };
}

function normalizeCursor(value: ReputationPreviewActionInput["cursor"]) {
  if (value == null) return null;
  if (!isIntegerInRange(value.authorId, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (typeof value.value === "number" && Number.isFinite(value.value)) return value;
  if (typeof value.value === "string" && value.value.length <= 500) return value;
  return null;
}

export async function previewReputationAction(
  input: ReputationPreviewActionInput,
): Promise<ReputationPreviewActionResult> {
  await requireAdminUser();

  const config = normalizePreviewConfig(input.config);
  const level = input.level == null ? null : input.level;
  const cursor = normalizeCursor(input.cursor);
  if (
    !config ||
    !isReputationPreviewSort(input.sort) ||
    (input.direction !== "asc" && input.direction !== "desc") ||
    (input.pageSize !== 25 && input.pageSize !== 50) ||
    typeof input.onlyCandidates !== "boolean" ||
    (level !== null && !config.levels.some((item) => item.level === level)) ||
    (input.cursor != null && cursor === null)
  ) {
    return { data: null, error: "Параметры предпросмотра не прошли проверку." };
  }

  try {
    const data = await getReputationPreview({
      config,
      cursor,
      direction: input.direction,
      level,
      onlyCandidates: input.onlyCandidates,
      pageSize: input.pageSize,
      sort: input.sort,
    });
    return { data, error: null };
  } catch (error) {
    console.error("Reputation preview failed", error);
    return {
      data: null,
      error: "Не удалось рассчитать предпросмотр. Проверь настройки и попробуй ещё раз.",
    };
  }
}

export async function saveReputationConfigurationAction(config: ReputationPreviewConfig) {
  const admin = await requireAdminUser();
  try {
    const normalized = normalizePreviewConfig(config);
    if (!normalized) return { error: "Настройки не прошли проверку.", success: null };
    assertValidReputationPreviewConfig(normalized);
    await saveReputationConfiguration({ adminUserId: admin.id, config: normalized });
    await logActivity({
      action: "reputation.settings.updated",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "reputation-settings",
      entityId: 1,
      entityLabel: "Уровни и доверие",
      message: "Настройки уровней и доверия изменены.",
    });
    return { error: null, success: "Настройки сохранены." };
  } catch (error) {
    console.error("Failed to save reputation settings", error);
    return {
      error: error instanceof Error && error.message === "locked-level"
        ? "Нельзя изменить порог уже достигнутого уровня."
        : "Не удалось сохранить настройки.",
      success: null,
    };
  }
}

export async function enableReputationAction(config: ReputationPreviewConfig) {
  const admin = await requireAdminUser();
  const saved = await saveReputationConfigurationAction(config);
  if (saved.error) return saved;
  try {
    const started = await beginReputationInitialization();
    if (!started) return { error: "Расчёт уже запущен.", success: null };
    await enqueueJobRun({
      createdByAdminId: admin.id,
      payload: {},
      source: "manual",
      type: "reputation.initialize",
    });
    await logActivity({
      action: "reputation.initialization.requested",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "reputation-settings",
      entityId: 1,
      entityLabel: "Уровни и доверие",
      message: "Запущен первичный расчёт уровней и доверия.",
    });
    return { error: null, success: "Расчёт поставлен в очередь." };
  } catch (error) {
    await setReputationSystemStatus("disabled");
    console.error("Failed to enqueue reputation initialization", error);
    return { error: "Не удалось поставить расчёт в очередь.", success: null };
  }
}

export async function disableReputationAction() {
  const admin = await requireAdminUser();
  try {
    await setReputationSystemStatus("disabled");
    await logActivity({
      action: "reputation.disabled",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "reputation-settings",
      entityId: 1,
      entityLabel: "Уровни и доверие",
      message: "Начисление уровней и доверия приостановлено.",
    });
    return { error: null, success: "Система приостановлена." };
  } catch (error) {
    console.error("Failed to disable reputation", error);
    return { error: "Не удалось приостановить систему.", success: null };
  }
}
