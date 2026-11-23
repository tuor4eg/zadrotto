import { createHash } from "node:crypto";
import { normalizeSearchText } from "@/lib/search/normalize";

export type ClassificationDecision = {
  id: number;
  group: "keep" | "tag" | "ambiguous";
  /** Explicit final parent for every retained series, including null for a root. */
  parentId: number | null;
  /** Explicit consent to match an existing tag; absent means create with source code/title. */
  tagId?: number;
};
export type ClassificationManifest = {
  version: 1;
  series: ClassificationDecision[];
  pendingLinks: { mediaItemId: number; franchiseId: number; decision: "discard" }[];
  removalRequests: { mediaItemId: number; franchiseId: number; decision: "discard" }[];
};
export type RawRow = Record<string, unknown>;
export type ClassificationSnapshot = {
  franchises: RawRow[];
  media_item_franchises: RawRow[];
  /** Present only in migration history written before the table was removed. */
  creator_series?: RawRow[];
  media_item_franchise_removal_requests: RawRow[];
  genres: RawRow[];
  achievements: RawRow[];
  tags: RawRow[];
  media_item_tags: RawRow[];
  systemAuthors: RawRow[];
  providerLinks: RawRow[];
  foreignKeys: RawRow[];
  archiveSettings: RawRow[];
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function classificationHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function currentClassificationSnapshot(snapshot: ClassificationSnapshot): ClassificationSnapshot {
  if (!Object.hasOwn(snapshot, "creator_series")) return snapshot;
  const current = { ...snapshot, foreignKeys: snapshot.foreignKeys.filter((key) => key.table_name !== "creator_series") };
  delete current.creator_series;
  return current;
}

/** Compare old journals using their own retired data. The rollback never restores the removed relation. */
export function classificationRollbackHash(inventory: { state: ClassificationSnapshot; proof: unknown }, reference: ClassificationSnapshot) {
  if (!Object.hasOwn(reference, "creator_series")) {
    return classificationHash({ state: inventory.state, proof: inventory.proof });
  }
  const foreignKeys = [...inventory.state.foreignKeys];
  reference.foreignKeys.forEach((key, index) => {
    if (key.table_name === "creator_series") foreignKeys.splice(index, 0, key);
  });
  return classificationHash({
    state: { ...inventory.state, creator_series: reference.creator_series, foreignKeys },
    proof: inventory.proof,
  });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Манифест должен содержать объекты.");
  return value as Record<string, unknown>;
}
function exact(row: RawRow, keys: string[]) {
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) throw new Error("Неизвестные или пропущенные поля манифеста.");
}
function id(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2147483647) throw new Error("Некорректный ID манифеста.");
  return value as number;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Ожидался массив решений.");
  return value;
}
export function parseClassificationManifest(value: unknown): ClassificationManifest {
  const input = object(value);
  exact(input, ["version", "series", "pendingLinks", "removalRequests"]);
  if (input.version !== 1) throw new Error("Неизвестная версия манифеста.");
  const series = list(input.series).map((value): ClassificationDecision => {
    const row = object(value); exact(row, Object.hasOwn(row, "tagId") ? ["id", "group", "parentId", "tagId"] : ["id", "group", "parentId"]);
    if (row.group !== "keep" && row.group !== "tag" && row.group !== "ambiguous") throw new Error("Неизвестная группа серии.");
    if (row.tagId !== undefined && row.group !== "tag") throw new Error("Существующий тег можно выбрать только для группы tag.");
    return { id: id(row.id), group: row.group, parentId: row.parentId === null ? null : id(row.parentId), ...(row.tagId === undefined ? {} : { tagId: id(row.tagId) }) };
  });
  const links = (value: unknown) => list(value).map(value => {
    const row = object(value); exact(row, ["mediaItemId", "franchiseId", "decision"]);
    if (row.decision !== "discard") throw new Error("Требуется явное решение discard для неопубликованной связи или заявки.");
    return { mediaItemId: id(row.mediaItemId), franchiseId: id(row.franchiseId), decision: "discard" as const };
  });
  return { version: 1, series, pendingLinks: links(input.pendingLinks), removalRequests: links(input.removalRequests) };
}

/** Mirrors publishedSeriesBranchSql: an unpublished intermediate node blocks traversal. */
export function publishedMembership(snapshot: ClassificationSnapshot, rootId: number): number[] {
  const root = snapshot.franchises.find(row => row.id === rootId);
  if (root?.publication_status !== "published") return [];
  const branch = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of snapshot.franchises) if (row.publication_status === "published" && branch.has(Number(row.parent_id)) && !branch.has(Number(row.id))) { branch.add(Number(row.id)); changed = true; }
  }
  return [...new Set(snapshot.media_item_franchises.filter(row => branch.has(Number(row.franchise_id)) && row.publication_status === "published").map(row => Number(row.media_item_id)))].sort((a, b) => a - b);
}

export function draftClassificationManifest(snapshot: ClassificationSnapshot): ClassificationManifest {
  return { version: 1, series: snapshot.franchises.map(row => ({ id: Number(row.id), group: "ambiguous", parentId: row.parent_id === null ? null : Number(row.parent_id) })), pendingLinks: [], removalRequests: [] };
}

export function classificationBlockers(snapshot: ClassificationSnapshot, manifest: ClassificationManifest): string[] {
  const errors: string[] = [];
  const byId = new Map(manifest.series.map(row => [row.id, row]));
  if (byId.size !== manifest.series.length || snapshot.franchises.length !== byId.size || snapshot.franchises.some(row => !byId.has(Number(row.id)))) errors.push("Манифест должен содержать ровно одно решение для каждой серии.");
  if (manifest.series.some(row => row.group === "ambiguous")) errors.push("Остались неоднозначные серии.");
  const themes = new Set(manifest.series.filter(row => row.group === "tag").map(row => row.id));
  if (!themes.size) errors.push("Не выбраны тематические серии для переноса.");
  if (snapshot.systemAuthors.length !== 1) errors.push("Требуется ровно один системный автор.");
  for (const row of manifest.series) {
    if (row.group === "tag" && row.parentId !== null) errors.push(`Для темы #${row.id} parentId должен быть null.`);
    if (row.group !== "keep") continue;
    let current: ClassificationDecision | undefined = row;
    const visited = new Set<number>();
    while (current) {
      if (visited.has(current.id)) { errors.push(`Цикл родителей у серии #${row.id}.`); break; }
      visited.add(current.id);
      const maxDepth = Number(snapshot.archiveSettings[0]?.max_franchise_depth ?? 5);
      if (visited.size > maxDepth) { errors.push(`Глубина серии #${row.id} превышает настройку ${maxDepth}.`); break; }
      if (current.parentId === null) break;
      const next: ClassificationDecision | undefined = byId.get(current.parentId);
      if (next?.group !== "keep") { errors.push(`Родитель серии #${row.id} должен остаться серией.`); break; }
      current = next;
    }
  }
  const titles = new Set(snapshot.tags.map(tag => normalizeSearchText(String(tag.title))));
  for (const row of snapshot.franchises.filter(row => themes.has(Number(row.id)))) {
    const existingTagId = byId.get(Number(row.id))?.tagId;
    if (existingTagId !== undefined) {
      if (!snapshot.tags.some(tag => tag.id === existingTagId)) errors.push(`Выбранный тег #${existingTagId} для темы #${row.id} не найден.`);
      continue;
    }
    if (snapshot.tags.some(tag => tag.code === row.code)) errors.push(`Код тега ${row.code} уже занят; требуется отдельное решение конфликта.`);
    const title = normalizeSearchText(String(row.title));
    if (titles.has(title)) errors.push(`Название тега «${row.title}» уже занято или повторяется в манифесте.`);
    titles.add(title);
    if (String(row.title).trim().length < 1 || String(row.title).trim().length > 80) errors.push(`Название темы #${row.id} не помещается в название тега (1–80 символов).`);
  }
  const requireDecisions = (actual: RawRow[], decisions: unknown[], key: (row: RawRow) => string, decisionKey: (row: RawRow) => string, label: string) => {
    const expected = new Set(actual.map(key));
    const received = new Set((decisions as RawRow[]).map(decisionKey));
    if (received.size !== decisions.length || expected.size !== received.size || [...expected].some(key => !received.has(key))) errors.push(`Требуются точные ручные решения: ${label}.`);
  };
  const linkKey = (row: RawRow) => `${row.media_item_id}:${row.franchise_id}`;
  const decisionKey = (row: RawRow) => `${row.mediaItemId}:${row.franchiseId}`;
  requireDecisions(snapshot.media_item_franchises.filter(row => themes.has(Number(row.franchise_id)) && row.publication_status !== "published"), manifest.pendingLinks, linkKey, decisionKey, "неопубликованные связи");
  requireDecisions(snapshot.media_item_franchise_removal_requests.filter(row => themes.has(Number(row.franchise_id))), manifest.removalRequests, linkKey, decisionKey, "заявки на удаление связей");
  if (snapshot.providerLinks.some(row => themes.has(Number(row.entity_id)))) errors.push("У тематических серий есть снимки провайдеров. Нужен отдельный план переноса ссылок.");
  const signature = (row: RawRow) => JSON.stringify([row.table_name, row.column_names, row.target_table, row.target_columns, row.delete_action]);
  const known = new Set([
    ["franchises", ["parent_id"], "franchises", ["id"], "r"],
    ["genres", ["replacement_franchise_id"], "franchises", ["id"], "n"],
    ["entry_sources", ["source_series_id"], "franchises", ["id"], "c"],
    ["media_item_franchises", ["franchise_id"], "franchises", ["id"], "c"],
    ["media_item_franchise_removal_requests", ["media_item_id", "franchise_id"], "media_item_franchises", ["media_item_id", "franchise_id"], "c"],
  ].map(row => JSON.stringify(row)));
  if (snapshot.foreignKeys.some(row => !known.has(signature(row)))) errors.push("Найдена неизвестная внешняя зависимость от серий.");
  for (const row of snapshot.genres) if (themes.has(Number(row.replacement_franchise_id)) && row.replacement_tag_id != null && byId.get(Number(row.replacement_franchise_id))?.tagId !== row.replacement_tag_id) errors.push(`У жанра #${row.id} уже есть другой заменяющий тег.`);
  for (const row of snapshot.achievements) {
    const params = row.params as RawRow;
    if (themes.has(Number(params.seriesId)) && params.tagId !== undefined) errors.push(`У ачивки #${row.id} одновременно заданы серия и тег.`);
  }
  return [...new Set(errors)];
}
