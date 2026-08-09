import { CronExpressionParser } from "cron-parser";

const CRON_FIELDS = 5;

export function validateJobCronExpression(expression: string) {
  const normalized = expression.trim();
  if (normalized.split(/\s+/).length !== CRON_FIELDS) {
    throw new Error("Cron expression must contain exactly five fields.");
  }
  CronExpressionParser.parse(normalized, { tz: "UTC" });
  return normalized;
}

export function getNextJobRunAt(expression: string, from: Date) {
  return CronExpressionParser.parse(validateJobCronExpression(expression), {
    currentDate: from,
    tz: "UTC",
  }).next().toDate();
}
