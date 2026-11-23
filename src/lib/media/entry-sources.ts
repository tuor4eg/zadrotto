export const ENTRY_SOURCE_LABELS = {
  entry: "Запись",
  creator: "Создатель",
  series: "Серия",
} as const;

export type EntrySourceType = keyof typeof ENTRY_SOURCE_LABELS;
export type EntrySource = { type: EntrySourceType; id: number };
export type EntrySourceOption = EntrySource & {
  label: string;
  code: string;
  avatarObjectKey?: string | null;
  mediaTypeName?: string | null;
  releaseYear?: number | null;
};

export type EntrySourceSearchOption = EntrySourceOption & { mediaTypeName: string | null; releaseYear: number | null };

export function isEntrySourceType(value: string): value is EntrySourceType {
  return Object.hasOwn(ENTRY_SOURCE_LABELS, value);
}

export function entrySourceKey(source: EntrySource) {
  return `${source.type}:${source.id}`;
}

export function parseEntrySourceId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const id = Number(value);
  return id <= 2147483647 ? id : null;
}

export function parseEntrySources(values: unknown[], entryId: number): EntrySource[] | null {
  const sources = new Map<string, EntrySource>();
  for (const value of values) {
    if (typeof value !== "string") return null;
    const [type, rawId, extra] = value.split(":");
    const id = parseEntrySourceId(rawId);
    if (extra !== undefined || !isEntrySourceType(type) || !id || (type === "entry" && id === entryId)) return null;
    const source = { type, id };
    const key = entrySourceKey(source);
    if (sources.has(key)) return null;
    sources.set(key, source);
  }
  return [...sources.values()];
}

export type NewEntryRelationship = {
  direction: "source" | "adaptation";
  targetId: number;
};

export function parseNewEntryRelationship(
  direction: FormDataEntryValue | null,
  target: FormDataEntryValue | null,
): NewEntryRelationship | null | false {
  if (direction === null && target === null) return null;
  const targetId = parseEntrySourceId(target);
  if ((direction !== "source" && direction !== "adaptation") || !targetId) return false;
  return { direction, targetId };
}
