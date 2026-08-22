export const BUG_REPORT_STATUSES = [
  "new",
  "reviewing",
  "confirmed",
  "fixed",
  "rejected",
] as const;

export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

export const BUG_REPORT_ENTITY_TYPES = ["media-item", "franchise", "quiz"] as const;

export type BugReportEntityType = (typeof BUG_REPORT_ENTITY_TYPES)[number];

export const BUG_REPORT_DESCRIPTION_MAX_LENGTH = 2_000;
export const BUG_REPORT_URL_MAX_LENGTH = 2_048;
export const BUG_REPORT_TIMEZONE_MAX_LENGTH = 100;
export const BUG_REPORT_USER_AGENT_MAX_LENGTH = 512;
export const BUG_REPORT_VIEWPORT_MAX_DIMENSION = 10_000;

export type BugReportClientContext = {
  timezone?: string;
  userAgent?: string;
  viewportHeight?: number;
  viewportWidth?: number;
};

export function isBugReportStatus(value: string): value is BugReportStatus {
  return (BUG_REPORT_STATUSES as readonly string[]).includes(value);
}

export function isBugReportEntityType(value: string): value is BugReportEntityType {
  return (BUG_REPORT_ENTITY_TYPES as readonly string[]).includes(value);
}

const ALLOWED_STATUS_TRANSITIONS: Record<BugReportStatus, readonly BugReportStatus[]> = {
  new: ["reviewing", "confirmed", "rejected"],
  reviewing: ["confirmed", "rejected"],
  confirmed: ["fixed"],
  rejected: ["reviewing"],
  fixed: ["confirmed"],
};

export function canTransitionBugReportStatus(from: BugReportStatus, to: BugReportStatus) {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}
