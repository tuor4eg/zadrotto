'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { TIER_LIST_STORAGE_EVENT, TIER_LIST_STORAGE_KEY, tierEntryIds, type TierLocalDraft } from '@/lib/tier-lists/model';
import { readTierDraft } from '@/lib/tier-lists/storage';

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === TIER_LIST_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(TIER_LIST_STORAGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(TIER_LIST_STORAGE_EVENT, onChange);
  };
}

function getSnapshot() {
  const draft = readTierDraft();
  return draft ? JSON.stringify(draft) : null;
}

const getServerSnapshot = () => null;

export function useLocalTierDraft() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function LocalTierDraftCard() {
  const snapshot = useLocalTierDraft();
  if (!snapshot) return null;
  const draft: TierLocalDraft = JSON.parse(snapshot);
  return <section aria-labelledby="local-tier-draft-title" className="mx-4 rounded-md border border-stone-400/45 bg-amber-50/30 p-4 sm:mx-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-wider text-stone-500">Ваш локальный черновик</p>
        <h2 id="local-tier-draft-title" className="break-words text-lg font-semibold">{draft.title.trim() || 'Без названия'}</h2>
        <p className="mt-1 text-sm text-stone-600">Записей: {tierEntryIds(draft.distribution).length}. Сохранён только в этом браузере.</p>
      </div>
      <Link href="/tier-lists/local" className={buttonVariants({ variant: 'outline' })}>Просмотреть</Link>
    </div>
  </section>;
}
