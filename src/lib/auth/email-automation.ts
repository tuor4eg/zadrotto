export const EMAIL_AUTOMATION_DEFAULTS = {
  deliveryIntervalSeconds: 60,
  deliveryBatchSize: 10,
  deliveryMaxAttempts: 5,
  retryBaseSeconds: 120,
  retryMaxSeconds: 3600,
  cleanupIntervalSeconds: 86400,
  challengeRetentionHours: 24,
  sessionRetentionDays: 7,
  staleRegistrationDays: 7,
  sentOutboxRetentionDays: 30,
  failedOutboxRetentionDays: 30,
} as const;

// Covers the worst configured batch (50 messages × 10s provider timeout) with margin.
export const EMAIL_AUTOMATION_LEASE_MS = 15 * 60 * 1000;

export type EmailAutomationSettingsInput = {
  -readonly [Key in keyof typeof EMAIL_AUTOMATION_DEFAULTS]: number;
};

const RANGES: Record<keyof EmailAutomationSettingsInput, readonly [number, number]> = {
  deliveryIntervalSeconds: [60, 3600],
  deliveryBatchSize: [1, 50],
  deliveryMaxAttempts: [1, 20],
  retryBaseSeconds: [60, 86400],
  retryMaxSeconds: [60, 604800],
  cleanupIntervalSeconds: [3600, 604800],
  challengeRetentionHours: [1, 720],
  sessionRetentionDays: [1, 365],
  staleRegistrationDays: [1, 90],
  sentOutboxRetentionDays: [1, 365],
  failedOutboxRetentionDays: [7, 730],
};

export function validateEmailAutomationSettings(input: Record<string, unknown>) {
  const values = {} as EmailAutomationSettingsInput;
  for (const key of Object.keys(RANGES) as (keyof EmailAutomationSettingsInput)[]) {
    const value = Number(input[key]);
    const [minimum, maximum] = RANGES[key];
    if (!Number.isInteger(value) || value < minimum || value > maximum) return null;
    values[key] = value;
  }
  if (values.retryMaxSeconds < values.retryBaseSeconds) return null;
  return values;
}

export function calculateEmailRetryDelaySeconds(input: {
  attempts: number;
  baseSeconds: number;
  maxSeconds: number;
}) {
  return Math.min(input.maxSeconds, input.baseSeconds * 2 ** Math.max(0, input.attempts - 1));
}

export function sanitizeEmailDeliveryError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "Unknown delivery error");
  return message
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\bre_[A-Za-z0-9_-]+\b/g, "re_[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .slice(0, 500);
}
