import { JobError } from "./types";

export type JobManualPlacement = "general" | "domain" | "migration" | "none";

const GENERAL = new Set([
  "media.creator-name-localization",
  "media.creator-images-backfill", "media.metadata-backfill", "media.cover-thumbnails-backfill",
  "media.rating-stats-reconcile", "auth.email-outbox-delivery", "domain-events.dispatch",
  "notifications.transport-delivery",
]);
const DOMAIN = new Set([
  "provider.snapshots", "media.creator-image-refresh", "media.platform-logos-sync", "achievements.backfill",
  "reputation.initialize", "media.genre-series-apply",
]);
export type JobMigrationDefinition = { description: string; form: "tmdb" | "bgg" | "fantlab" | "empty" };
/** Completed production transfers are retired; keep the section ready for future migrations. */
export const JOB_MIGRATIONS: Readonly<Record<string, JobMigrationDefinition>> = {};

export function getJobManualPlacement(type: string): JobManualPlacement {
  if (GENERAL.has(type)) return "general";
  if (DOMAIN.has(type)) return "domain";
  if (Object.hasOwn(JOB_MIGRATIONS, type)) return "migration";
  return "none";
}

export function assertJobManualPlacement(type: string, placement: JobManualPlacement) {
  if (getJobManualPlacement(type) !== placement) {
    throw new JobError("manual-placement", "Эта операция недоступна в выбранном разделе задач.", { retryable: false });
  }
}

export function getMigrationDefinition(type: string) {
  return Object.hasOwn(JOB_MIGRATIONS, type) ? JOB_MIGRATIONS[type] : null;
}
