export type JobProgress = { done: number | null; total: number | null; percent: number | null; stage: string | null; stats: { label: string; value: number }[] };
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const STAGES: Record<string, string> = { identity: "Сопоставление", catalogue: "Каталог", profiles: "Профили", images: "Изображения", request: "Заявки", complete: "Завершение" };
const STATS = [
  ["processed", "Обработано"], ["failed", "Ошибок"], ["skipped", "Пропущено"], ["created", "Создано"],
  ["updated", "Обновлено"], ["approved", "Одобрено"], ["storedImages", "Изображений сохранено"], ["missingImages", "Без портрета у источника"],
  ["processedPlatforms", "Платформ обработано"], ["remainingPlatforms", "Платформ осталось"], ["errors", "Ошибок"],
  ["newRequests", "Новых заявок"], ["createdRequests", "Новых заявок"], ["applied", "Применено"],
] as const;
/** Only known counters are exposed. Cursors/IDs are never a denominator for percentages. */
export function getJobProgress(type: string, payloadValue: unknown): JobProgress {
  const payload = record(payloadValue);
  const checkpoint = record(payload.profileCheckpoint ?? payload.checkpoint);
  const counters = record(checkpoint.counters);
  const values = { ...payload, ...checkpoint, ...counters };
  const stats: JobProgress["stats"] = [];
  for (const [key, label] of STATS) {
    const value = count(values[key]);
    if (value !== null && !stats.some(stat => stat.label === label)) stats.push({ label: key === "missingImages" && type === "media.creator-images-backfill" ? "Без изображения у источника" : label, value });
  }
  let done: number | null = count(values.processed);
  const failed = count(values.failed) ?? 0;
  if (done !== null) done += failed;
  let total = count(values.total);
  if (type === "provider.snapshots") {
    const targets = Array.isArray(payload.profileTargets) ? payload.profileTargets : Array.isArray(payload.creatorIds) ? payload.creatorIds : Array.isArray(payload.mediaItemIds) ? payload.mediaItemIds : null;
    if (targets) {
      const from = count(payload.afterId) ?? 0;
      const through = count(payload.throughId);
      total = targets.filter(id => typeof id !== "number" || (id > from && (through === null || id <= through))).length;
    }
    if (payload.onlyMissingSnapshots || payload.profileCheckpoint) total = null;
    if (Array.isArray(payload.profileTargets)) { total = payload.profileTargets.length; done = count(checkpoint.nextTargetIndex) ?? done; }
  }
  if (type === "media.platform-logos-sync") {
    // Stage positions are local to each pass, not progress for the whole job.
    done = null; total = null;
  }
  if (Array.isArray(payload.reports) && stats.length === 0) stats.push({ label: "Проверено", value: payload.reports.length });
  const percent = done !== null && total !== null && total > 0 ? Math.min(100, Math.floor(done / total * 100)) : null;
  return { done, total, percent, stage: typeof checkpoint.stage === "string" ? STAGES[checkpoint.stage] ?? null : null, stats };
}
