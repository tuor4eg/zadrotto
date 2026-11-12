export const TIER_PREVIEW_GENERATE = 'tier-lists.preview-generate';
export const TIER_PREVIEW_CLEANUP = 'tier-lists.preview-cleanup';

export function isTierPreviewKey(key: unknown): key is string {
  return typeof key === 'string' && /^tier-lists\/previews\/[1-9]\d*\/[0-9a-f-]{36}\.webp$/.test(key);
}

export function resolveTierPreviewUrl(key: string | null): string | null {
  return isTierPreviewKey(key) ? `/tier-list-previews/${key}` : null;
}

export function tierPreviewListId(key: string): number | null {
  if (!isTierPreviewKey(key)) return null;
  const id = Number(key.split('/')[2]);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
