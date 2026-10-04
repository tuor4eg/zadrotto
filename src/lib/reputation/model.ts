export const REPUTATION_ACTION_CODES = [
  "rating.created",
  "media.published",
  "series.link-existing.published",
  "series.created-with-link.published",
  "series.link-removal.published",
  "review.published",
  "bug-report.confirmed",
] as const;

export type ReputationActionCode = (typeof REPUTATION_ACTION_CODES)[number];

export const REPUTATION_ACTION_LABELS: Record<ReputationActionCode, string> = {
  "rating.created": "Новая оценка записи",
  "media.published": "Новая запись",
  "series.link-existing.published": "Связь с существующей серией",
  "series.created-with-link.published": "Новая серия с записью",
  "series.link-removal.published": "Удаление ошибочной связи",
  "review.published": "Опубликованная рецензия",
  "bug-report.confirmed": "Подтверждённый багрепорт",
};

export const DEFAULT_XP_BY_ACTION: Record<ReputationActionCode, number> = {
  "rating.created": 1,
  "media.published": 5,
  "series.link-existing.published": 2,
  "series.created-with-link.published": 4,
  "series.link-removal.published": 2,
  "review.published": 10,
  "bug-report.confirmed": 5,
};

export const DEFAULT_TRUST_ENABLED_BY_ACTION: Record<ReputationActionCode, boolean> = {
  "rating.created": false,
  "media.published": true,
  "series.link-existing.published": true,
  "series.created-with-link.published": true,
  "series.link-removal.published": true,
  "review.published": false,
  "bug-report.confirmed": false,
};

export const DEFAULT_TRUST_BY_ACTION: Record<ReputationActionCode, number> = {
  "rating.created": 1,
  "media.published": 1,
  "series.link-existing.published": 1,
  "series.created-with-link.published": 1,
  "series.link-removal.published": 1,
  "review.published": 1,
  "bug-report.confirmed": 1,
};

export const DEFAULT_LEVEL_THRESHOLDS = [0, 20, 60, 120, 220, 350, 550, 800, 1150, 1550] as const;
export const DEFAULT_LEVEL_NAMES = [
  "Новичок с мануалом",
  "Искатель пасхалок",
  "Укротитель бэклога",
  "Хранитель канона",
  "Повелитель спойлеров",
  "Архивариус мультивселенной",
  "Босс секретного уровня",
  "Легенда локального кооператива",
  "Финальный коллекционер",
  "Хранитель Гикотеки",
] as const;

export type ReputationSystemStatus = "disabled" | "initializing" | "enabled";
export type ReputationOutcome = "published" | "approved" | "rejected";

export type ReputationRuleValues = {
  actionCode: ReputationActionCode;
  countsTowardTrust: boolean;
  trustPoints: number;
  xp: number;
};

export type ReputationLevelThreshold = { level: number; name: string; xpThreshold: number };

export type ReputationPreviewConfig = {
  levels: ReputationLevelThreshold[];
  rules: ReputationRuleValues[];
  trusted: {
    approvalRatePercent: number;
    autoPromotionEnabled: boolean;
    historyDays: number;
    level: number;
    trustPoints: number;
  };
};

export const REPUTATION_PREVIEW_SORTS = [
  "author",
  "xp",
  "level",
  "trust",
  "approvalRate",
] as const;
export type ReputationPreviewSort = (typeof REPUTATION_PREVIEW_SORTS)[number];
export type ReputationPreviewDirection = "asc" | "desc";

export type ReputationPreviewRow = {
  approvalRate: number | null;
  authorCode: string;
  authorId: number;
  authorName: string;
  bugReports: number;
  createdSeries: number;
  firstQualifyingActionAt: string | null;
  historyDays: number;
  level: number;
  linkedSeries: number;
  mediaItems: number;
  ratings: number;
  rejectedOutcomes: number;
  removedSeriesLinks: number;
  reviews: number;
  successfulOutcomes: number;
  trustPoints: number;
  wouldBecomeTrusted: boolean;
  xp: number;
};

export type ReputationPreviewSummary = {
  authorsCount: number;
  averageLevel: number;
  candidatesCount: number;
  calculatedAt: string;
  insufficientHistoryCount: number;
  levelDistribution: Array<{ authors: number; level: number }>;
  maxLevel: number;
  maxXp: number;
  medianLevel: number;
  trustDistribution: Array<{ authors: number; points: number }>;
  warnings: string[];
};

export type ReputationPreviewResult = {
  hasMore: boolean;
  nextCursor: { authorId: number; value: number | string } | null;
  rows: ReputationPreviewRow[];
  summary: ReputationPreviewSummary;
};

export function isReputationActionCode(value: string): value is ReputationActionCode {
  return (REPUTATION_ACTION_CODES as readonly string[]).includes(value);
}

export function isReputationPreviewSort(value: string): value is ReputationPreviewSort {
  return (REPUTATION_PREVIEW_SORTS as readonly string[]).includes(value);
}
