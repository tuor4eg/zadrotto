import { normalizeSearchText } from "@/lib/search/normalize";
import type { ClassificationManifest, ClassificationSnapshot } from "./model";

export type ClassificationSeriesOption = { id: number; title: string; parentId: number | null };

export function retainedParentId(parentById: ReadonlyMap<number, number | null>, id: number, kept: ReadonlySet<number>) {
  const visited = new Set([id]);
  let parentId = parentById.get(id) ?? null;
  while (parentId !== null) {
    if (visited.has(parentId)) throw new Error("В дереве серий обнаружен цикл. Исправьте его перед переносом.");
    visited.add(parentId);
    if (kept.has(parentId)) return parentId;
    parentId = parentById.get(parentId) ?? null;
  }
  return null;
}

/** Server derives the journal's internal manifest from ordinary form controls and current data. */
export function classificationManifestFromSelection(state: ClassificationSnapshot, form: FormData): ClassificationManifest {
  const ids = new Set(state.franchises.map(row => Number(row.id)));
  const values = form.getAll("keepSeriesId").map(value => Number(value));
  if (values.some(id => !Number.isSafeInteger(id) || !ids.has(id)) || new Set(values).size !== values.length) throw new Error("Выбор серий устарел. Откройте дерево заново.");
  const kept = new Set(values);
  const parents = new Map(state.franchises.map(row => [Number(row.id), row.parent_id == null ? null : Number(row.parent_id)]));
  const series = state.franchises.map(row => {
    const id = Number(row.id);
    if (kept.has(id)) return { id, group: "keep" as const, parentId: retainedParentId(parents, id, kept) };
    return { id, group: "tag" as const, parentId: null };
  });
  const creatorLinks = state.creator_series.filter(row => !kept.has(Number(row.series_id))).map(row => {
    const value = String(form.get(`creatorTarget:${row.creator_id}:${row.series_id}`) ?? "");
    if (!value || value !== "remove" && (!Number.isSafeInteger(Number(value)) || !kept.has(Number(value)))) throw new Error("Выберите действие для каждой связи создателя с переносимой серией.");
    return { creatorId: Number(row.creator_id), seriesId: Number(row.series_id), targetSeriesId: value === "remove" ? null : Number(value) };
  });
  function discarded(rows: ClassificationSnapshot["media_item_franchises"], field: string) {
    return rows.filter(row => !kept.has(Number(row.franchise_id))).map(row => {
      if (form.get(`${field}:${row.media_item_id}:${row.franchise_id}`) !== "discard") throw new Error("Подтвердите обработку неопубликованных связей и открытых запросов переноса.");
      return { mediaItemId: Number(row.media_item_id), franchiseId: Number(row.franchise_id), decision: "discard" as const };
    });
  }
  return {
    version: 1, series, creatorLinks,
    pendingLinks: discarded(state.media_item_franchises.filter(row => row.publication_status !== "published"), "pending"),
    removalRequests: discarded(state.media_item_franchise_removal_requests, "removal"),
  };
}

export function initialKeptSeriesIds(series: readonly ClassificationSeriesOption[], manifest?: ClassificationManifest) {
  // New plans keep everything until the administrator deliberately clears individual boxes.
  return manifest ? manifest.series.filter(row => row.group !== "tag").map(row => row.id) : series.map(row => row.id);
}


export type ClassificationTreeNode = ClassificationSeriesOption & { children: ClassificationTreeNode[] };
export function classificationTree(series: readonly ClassificationSeriesOption[]): ClassificationTreeNode[] {
  const byParent = new Map<number | null, ClassificationSeriesOption[]>();
  const ids = new Set(series.map(row => row.id));
  for (const row of series) {
    const parentId = row.parentId !== null && ids.has(row.parentId) ? row.parentId : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(row);
    byParent.set(parentId, siblings);
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  const visited = new Set<number>();
  function visit(row: ClassificationSeriesOption): ClassificationTreeNode | null {
    if (visited.has(row.id)) return null;
    visited.add(row.id);
    return { ...row, children: (byParent.get(row.id) ?? []).flatMap(child => { const node = visit(child); return node ? [node] : []; }) };
  }
  // Keep damaged/orphaned branches visible too; server validation still rejects cycles.
  return [...(byParent.get(null) ?? []), ...series].flatMap(row => { const node = visit(row); return node ? [node] : []; });
}

/** Keep ancestors visible without unmounting any form controls during search. */
export function classificationSearchVisibility(tree: readonly ClassificationTreeNode[], search: string) {
  const query = normalizeSearchText(search);
  const visible = new Set<number>();
  function visit(node: ClassificationTreeNode): boolean {
    const childMatches = node.children.map(visit).some(Boolean);
    const matches = !query || normalizeSearchText(node.title).includes(query) || childMatches;
    if (matches) visible.add(node.id);
    return matches;
  }
  tree.forEach(visit);
  return visible;
}
