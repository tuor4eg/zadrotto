import { parseTierLocalDraft, TIER_LIST_STORAGE_EVENT, TIER_LIST_STORAGE_KEY, type TierLocalDraft } from './model';

export function readTierDraft(): TierLocalDraft | null {
  try { const raw = localStorage.getItem(TIER_LIST_STORAGE_KEY); return raw ? parseTierLocalDraft(JSON.parse(raw)) : null; } catch { return null; }
}
export function writeTierDraft(draft: TierLocalDraft, expectedSnapshot?: string | null): boolean {
  try {
    const raw = localStorage.getItem(TIER_LIST_STORAGE_KEY);
    const current = readTierDraft();
    if (raw !== null && !current) return false;
    if (expectedSnapshot !== undefined && (current ? JSON.stringify(current) : null) !== expectedSnapshot) return false;
    localStorage.setItem(TIER_LIST_STORAGE_KEY, JSON.stringify(draft));
    window.dispatchEvent(new Event(TIER_LIST_STORAGE_EVENT)); return true;
  } catch { return false; }
}
export function clearTierDraftIfSnapshot(snapshot: string): boolean {
  try {
    const current = readTierDraft();
    if (!current || JSON.stringify(current) !== snapshot) return false;
    localStorage.removeItem(TIER_LIST_STORAGE_KEY); window.dispatchEvent(new Event(TIER_LIST_STORAGE_EVENT)); return true;
  } catch { return false; }
}

export type TierRecovery = { schemaVersion: 1; baseVersion: number | null; draft: TierLocalDraft };
const RECOVERY_PREFIX = 'geekoteka.tier-recovery.v1:';
export function tierRecoveryKey(authorId: number, publicId: string): string { return `${RECOVERY_PREFIX}${authorId}:${publicId}`; }
export function readTierRecovery(key: string): TierRecovery | null {
  try {
    const raw = sessionStorage.getItem(key); if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    if (candidate.schemaVersion !== 1 || candidate.baseVersion !== null && (!Number.isSafeInteger(candidate.baseVersion) || Number(candidate.baseVersion) < 1)) return null;
    const draft = parseTierLocalDraft(candidate.draft);
    return draft ? { schemaVersion: 1, baseVersion: candidate.baseVersion as number | null, draft } : null;
  } catch { return null; }
}
export function writeTierRecovery(key: string, value: TierRecovery): boolean {
  try { sessionStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function removeTierRecovery(key: string): void { try { sessionStorage.removeItem(key); } catch { /* Recovery is best effort. */ } }
export function newTierRecoveryKey(creationId?: string, authorId = 0): string | null {
  try {
    if (creationId) { sessionStorage.setItem(`${RECOVERY_PREFIX}${authorId}:new`, creationId); return `${RECOVERY_PREFIX}${authorId}:new:${creationId}`; }
    const id = sessionStorage.getItem(`${RECOVERY_PREFIX}${authorId}:new`);
    return id ? `${RECOVERY_PREFIX}${authorId}:new:${id}` : null;
  } catch { return null; }
}

/** Call only after the user explicitly confirms replacing the local document. */
export function replaceTierDraft(draft: TierLocalDraft): boolean {
  try {
    localStorage.setItem(TIER_LIST_STORAGE_KEY, JSON.stringify(draft));
    window.dispatchEvent(new Event(TIER_LIST_STORAGE_EVENT));
    return true;
  } catch { return false; }
}
