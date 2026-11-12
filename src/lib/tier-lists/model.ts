export type TierLevel = { id: string; name: string; color: string };
export type TierConfiguration = { schemaVersion: 1; backgroundColor?: string; levels: TierLevel[] };
export type TierDistribution = Record<string, number[]>;
export type TierListLimits = { maxEntries: number; maxDrafts: number; maxPublished: number; publicationsPerDay: number; creationsPerDay: number; maxLevels: number };
export const DEFAULT_TIER_LIST_LIMITS: TierListLimits = { maxEntries: 200, maxDrafts: 10, maxPublished: 30, publicationsPerDay: 5, creationsPerDay: 20, maxLevels: 10 };
export const DEFAULT_TIER_BACKGROUND = '#20201d';
export function tierBackground(configuration: TierConfiguration): string { return configuration.backgroundColor ?? DEFAULT_TIER_BACKGROUND; }
export function tierForeground(configuration: TierConfiguration): string {
  const hex = tierBackground(configuration).slice(1);
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179 ? '#1c1917' : '#fafaf9';
}
export const DEFAULT_TIER_CONFIGURATION: TierConfiguration = { schemaVersion: 1, backgroundColor: DEFAULT_TIER_BACKGROUND, levels: [
  { id: 's', name: 'S', color: '#ff7f7f' }, { id: 'a', name: 'A', color: '#ffbf7f' },
  { id: 'b', name: 'B', color: '#ffdf7f' }, { id: 'c', name: 'C', color: '#ffff7f' },
  { id: 'd', name: 'D', color: '#bfff7f' }, { id: 'f', name: 'F', color: '#7fbfff' },
] };
export const TIER_LIST_STORAGE_KEY = 'geekoteka.tier-list.v1';
export const TIER_LIST_STORAGE_EVENT = 'geekoteka:tier-list';
export const MAX_TIER_LIST_PAYLOAD_BYTES = 128 * 1024;
export type TierLocalDraft = { schemaVersion: 1; clientCreationId: string; title: string; templateId: number; snapshotToken: string; configuration: TierConfiguration; distribution: TierDistribution; updatedAt: string };
export type TierTemplate = { id: number; name: string; configuration: TierConfiguration; snapshotToken: string; isDefault: boolean };
export type TierListDocument = { id: number; publicId: string; authorId: number; title: string; templateId: number | null; configuration: TierConfiguration; distribution: TierDistribution; status: 'draft' | 'published'; hiddenAt: string | null; version: number; clientCreationId: string; unavailableCount: number; unavailableIds: number[] };
export type TierSaveInput = { publicId: string; version: number; title: string; distribution: TierDistribution };
export type TierCreateInput = { clientCreationId: string; title: string; templateId: number; distribution?: TierDistribution };
export type TierActionResult = { ok: true; document: TierListDocument } | { ok: false; error: string; code: string };
export function isUuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function parseTierConfiguration(value: unknown, maxLevels = 20): TierConfiguration | null {
  if (!record(value) || Object.keys(value).filter(key => key !== 'backgroundColor').sort().join(',') !== 'levels,schemaVersion' || value.schemaVersion !== 1 || !Array.isArray(value.levels) || !value.levels.length || value.levels.length > maxLevels) return null;
  if ('backgroundColor' in value && (typeof value.backgroundColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.backgroundColor))) return null;
  const ids = new Set<string>();
  for (const level of value.levels) {
    if (!record(level) || Object.keys(level).sort().join(',') !== 'color,id,name' || typeof level.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(level.id) || ids.has(level.id) || typeof level.name !== 'string' || !level.name.trim() || level.name.length > 40 || typeof level.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(level.color)) return null;
    ids.add(level.id);
  }
  return value as TierConfiguration;
}
export function emptyTierDistribution(configuration: TierConfiguration): TierDistribution { return Object.fromEntries(configuration.levels.map(level => [level.id, []])); }
export function parseTierDistribution(value: unknown, configuration: TierConfiguration, maxEntries = 1000): TierDistribution | null {
  if (!record(value) || Object.keys(value).sort().join(',') !== configuration.levels.map(level => level.id).sort().join(',')) return null;
  const seen = new Set<number>();
  for (const level of configuration.levels) {
    const ids = value[level.id];
    if (!Array.isArray(ids)) return null;
    for (const id of ids) {
      if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647 || seen.has(id)) return null;
      seen.add(id);
      if (seen.size > maxEntries) return null;
    }
  }
  return value as TierDistribution;
}
/** JSONB object key order is insignificant; entry order within each level is not. */
export function sameTierDistribution(left: TierDistribution, right: TierDistribution): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => {
    const entries = right[key];
    return Array.isArray(entries) && left[key].length === entries.length && left[key].every((id, index) => id === entries[index]);
  });
}
export function tierEntryIds(distribution: TierDistribution): number[] { return Object.values(distribution).flat(); }
export function tierRangeError(configuration: TierConfiguration, distribution: TierDistribution): string | null {
  const occupied = configuration.levels.map((level, index) => distribution[level.id]?.length ? index : -1).filter(index => index >= 0);
  if (!occupied.length) return 'Добавьте хотя бы одну запись.';
  const missing = configuration.levels.slice(occupied[0], occupied.at(-1)! + 1).filter(level => !distribution[level.id]?.length);
  return missing.length ? `Заполните уровни ${missing.map(level => level.name).join(', ')} или уберите записи из уровней выше или ниже них.` : null;
}
export function visibleTierLevels(configuration: TierConfiguration, distribution: TierDistribution) { return configuration.levels.filter(level => distribution[level.id]?.length); }
export function parseTierLocalDraft(value: unknown): TierLocalDraft | null {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'clientCreationId,configuration,distribution,schemaVersion,snapshotToken,templateId,title,updatedAt' || value.schemaVersion !== 1 || typeof value.snapshotToken !== 'string' || !/^[0-9a-f]{64}$/.test(value.snapshotToken) || !isUuid(value.clientCreationId) || typeof value.title !== 'string' || value.title.length > 80 || !Number.isSafeInteger(value.templateId) || Number(value.templateId) < 1 || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) return null;
  const configuration = parseTierConfiguration(value.configuration);
  if (!configuration || !parseTierDistribution(value.distribution, configuration)) return null;
  return value as TierLocalDraft;
}

/** Local import either matches the saved list or overwrites it. */
export function resolveTierImport(server: Pick<TierListDocument, 'title'|'distribution'>, local: Pick<TierLocalDraft, 'title'|'distribution'>): 'same'|'update' {
  return server.title === local.title.trim() && sameTierDistribution(server.distribution, local.distribution) ? 'same' : 'update';
}
