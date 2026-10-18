import { normalizeSearchText } from "@/lib/search/normalize";
import { createHash } from "node:crypto";
import { assignFantlabCreatorBinding, commitFantlabAvatar, getCreatorAvatarState, getCreatorFantlabBindings, getCreatorFantlabMappings, getFantlabCreatorBatch, getFantlabBindingOwner, getConflictingFantlabMappingOwners } from "@/db/queries/creator-avatars";
import { fetchProviderImage } from "@/lib/covers/provider-image-relay";
import { AVATAR_MAX_BYTES } from "@/lib/avatars/config";
import { deleteCreatorAvatarBestEffort, transformCreatorAvatarBuffer, uploadProcessedCreatorAvatarBuffer } from "./avatar-storage";
import { getFantlabAuthor, searchFantlabAuthors, selectExactFantlabAuthor } from "./fantlab-api";

export type FantlabSyncPayload = { dryRun: boolean; creatorId?: number; afterId: number; limit: number };
export type FantlabSyncStatus = "confirmed" | "ambiguous" | "conflict" | "no-image" | "manual" | "updated" | "unchanged" | "error" | "unresolved" | "would-confirm" | "would-update";
export type FantlabSyncRow = { creatorId: number; status: FantlabSyncStatus; message?: string; externalCreatorId?: string };
export type FantlabSyncReport = { processed: number; afterId: number; hasMore: boolean; counts: Partial<Record<FantlabSyncStatus, number>>; rows: FantlabSyncRow[] };

export function parseFantlabSyncPayload(value: unknown): FantlabSyncPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Параметры должны быть объектом.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["dryRun", "creatorId", "afterId", "limit"].includes(key))) throw new Error("Неизвестные параметры задачи.");
  const integer = (key: string, fallback?: number) => {
    const number = input[key] ?? fallback;
    if (!Number.isSafeInteger(number) || Number(number) < (key === "afterId" ? 0 : 1)) throw new Error(`Некорректный параметр ${key}.`);
    return number as number;
  };
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") throw new Error("dryRun должен быть boolean.");
  const limit = integer("limit", 50);
  if (limit > 200) throw new Error("Лимит не может превышать 200.");
  return { dryRun: input.dryRun === true, afterId: integer("afterId", 0), limit, ...(input.creatorId !== undefined ? { creatorId: integer("creatorId") } : {}) };
}

export async function migrateCreatorFantlabBinding(creatorId: number, dryRun: boolean, signal: AbortSignal): Promise<FantlabSyncRow> {
  const state = await getCreatorAvatarState(creatorId);
  if (!state) throw new Error("Создатель не найден.");
  const [bindings, mappings] = await Promise.all([getCreatorFantlabBindings(creatorId), getCreatorFantlabMappings(creatorId)]);
  if (bindings.length > 1) return { creatorId, status: "conflict", message: "У Creator несколько подтверждённых FantLab ID." };
  if (!mappings.some(mapping => mapping.bindingId === null)) return { creatorId, status: "unchanged" };
  if (bindings.length) return { creatorId, status: "unresolved", message: "Есть подтверждённый ID; оставшиеся варианты требуют ручного подтверждения без поиска по имени." };
  const ids = new Set<string>();
  const resolvedNames = new Set<string>();
  for (const mapping of mappings) {
    signal.throwIfAborted();
    const candidates = await searchFantlabAuthors(mapping.externalCreatorName, signal);
    const id = selectExactFantlabAuthor([mapping.externalCreatorName], candidates);
    if (!id) return { creatorId, status: "ambiguous", message: `Нет единственного точного совпадения: ${mapping.externalCreatorName}` };
    ids.add(id);
    candidates.filter(candidate => candidate.id === id).flatMap(candidate => candidate.names).forEach(name => resolvedNames.add(normalizeSearchText(name)));
  }
  if (ids.size !== 1) return { creatorId, status: "conflict", message: "Варианты имени соответствуют разным FantLab ID." };
  const externalCreatorId = [...ids][0];
  // Validate the author endpoint as well as search before persisting identity.
  await getFantlabAuthor(externalCreatorId, signal);
  // Detect cross-Creator conflicts even in dry-run; no writes or advisory locks needed.
  if ((await getConflictingFantlabMappingOwners(creatorId, [...resolvedNames])).length) return { creatorId, status: "conflict", externalCreatorId, message: "Варианты имени этого автора FantLab назначены разным Creator." };
  const owner = await getFantlabBindingOwner(externalCreatorId);
  if (owner && owner.creatorId !== creatorId) return { creatorId, status: "conflict", externalCreatorId, message: "FantLab ID уже назначен другому Creator." };
  signal.throwIfAborted();
  if (!dryRun) await assignFantlabCreatorBinding({ creatorId, externalCreatorId, mappingIds: mappings.map(mapping => mapping.id), expectedVersion: state.avatarVersion });
  return { creatorId, status: dryRun ? "would-confirm" : "confirmed", externalCreatorId };
}

const avatarDependencies = {
  getCreatorAvatarState, getCreatorFantlabBindings, getCreatorFantlabMappings, getFantlabAuthor,
  fetchProviderImage, transformCreatorAvatarBuffer, uploadProcessedCreatorAvatarBuffer,
  commitFantlabAvatar, deleteCreatorAvatarBestEffort,
};

export async function syncCreatorFantlabAvatar(creatorId: number, dryRun: boolean, signal: AbortSignal,
  dependencies: Partial<typeof avatarDependencies> = {}): Promise<FantlabSyncRow> {
  const { getCreatorAvatarState, getCreatorFantlabBindings, getCreatorFantlabMappings, getFantlabAuthor,
    fetchProviderImage, transformCreatorAvatarBuffer, uploadProcessedCreatorAvatarBuffer,
    commitFantlabAvatar, deleteCreatorAvatarBestEffort } = { ...avatarDependencies, ...dependencies };
  const state = await getCreatorAvatarState(creatorId);
  if (!state) throw new Error("Создатель не найден.");
  if (state.avatarSource === "manual") return { creatorId, status: "manual" };
  const [bindings, mappings] = await Promise.all([getCreatorFantlabBindings(creatorId), getCreatorFantlabMappings(creatorId)]);
  if (bindings.length > 1) return { creatorId, status: "conflict", message: "Выберите один FantLab ID в админке." };
  if (bindings.length !== 1 || mappings.some(mapping => mapping.bindingId === null)) return { creatorId, status: "unresolved", message: "Подтвердите FantLab ID для всех вариантов имени." };
  const binding = bindings[0];
  const author = await getFantlabAuthor(binding.externalCreatorId, signal);
  const urls = [...new Set([author.imageUrl, author.previewUrl].filter((url): url is string => Boolean(url)))];
  if (!urls.length) return { creatorId, status: "no-image" };
  let lastError: unknown;
  for (const originalUrl of urls) {
    signal.throwIfAborted();
    try {
      const image = await fetchProviderImage({ providerCode: "fantlab", imageUrl: originalUrl, maxBytes: AVATAR_MAX_BYTES });
      signal.throwIfAborted();
      if (!image.ok) throw new Error(`Изображение FantLab: ${image.error}`);
      const body = await transformCreatorAvatarBuffer(image.body);
      const contentHash = createHash("sha256").update(body).digest("hex");
      if (contentHash === state.avatarContentHash && state.avatarSource === "fantlab" && state.avatarSourceExternalId === binding.externalCreatorId) return { creatorId, status: "unchanged" };
      if (dryRun) return { creatorId, status: "would-update", externalCreatorId: binding.externalCreatorId };
      signal.throwIfAborted();
      const uploaded = await uploadProcessedCreatorAvatarBuffer({ creatorId, body });
      let committed = false;
      try {
        signal.throwIfAborted();
        const result = await commitFantlabAvatar({ creatorId, expectedVersion: state.avatarVersion, bindingId: binding.id,
          externalCreatorId: binding.externalCreatorId, ...uploaded, originalUrl, sourceUrl: author.sourceUrl });
        if (!result.committed) return { creatorId, status: "conflict", message: "Создатель или привязка изменились во время загрузки." };
        committed = true;
        await deleteCreatorAvatarBestEffort(result.previousObjectKey);
        return { creatorId, status: "updated", externalCreatorId: binding.externalCreatorId };
      } finally { if (!committed) await deleteCreatorAvatarBestEffort(uploaded.objectKey); }
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted();
      lastError = error;
    }
  }
  throw lastError;
}

export async function runFantlabCreatorBatch(kind: "bindings" | "avatars", payload: FantlabSyncPayload, signal: AbortSignal,
  progress?: (row: FantlabSyncRow) => Promise<void>): Promise<FantlabSyncReport> {
  const report: FantlabSyncReport = { processed: 0, afterId: payload.afterId, hasMore: false, counts: {}, rows: [] };
  while (report.processed < payload.limit) {
    signal.throwIfAborted();
    const batch = await getFantlabCreatorBatch(report.afterId, payload.creatorId);
    if (!batch.length) break;
    for (const creator of batch.slice(0, payload.limit - report.processed)) {
      signal.throwIfAborted();
      let row: FantlabSyncRow;
      try { row = await (kind === "bindings" ? migrateCreatorFantlabBinding : syncCreatorFantlabAvatar)(creator.id, payload.dryRun, signal); }
      catch (error) {
        if (signal.aborted) signal.throwIfAborted();
        row = { creatorId: creator.id, status: "error", message: error instanceof Error ? error.message : "Неизвестная ошибка." };
      }
      // Persist report before advancing the cursor. Reprocessing an interrupted item is safe.
      await progress?.(row);
      report.rows.push(row);
      report.counts[row.status] = (report.counts[row.status] ?? 0) + 1;
      report.processed++;
      report.afterId = creator.id;
    }
  }
  report.hasMore = (await getFantlabCreatorBatch(report.afterId, payload.creatorId)).length > 0;
  return report;
}
