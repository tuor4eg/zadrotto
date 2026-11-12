'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importTierListAction, saveTierListAction } from '@/app/tier-lists/actions';
import { resolveTierImport, tierEntryIds } from '@/lib/tier-lists/model';
import { clearTierDraftIfSnapshot, readTierDraft } from '@/lib/tier-lists/storage';

export function TierListImportBridge({ authenticated, authorId }: { authenticated: boolean; authorId: number | null }) {
  const router = useRouter();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!authenticated || authorId === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function attempt(count: number) {
      const draft = readTierDraft();
      if (stopped) return;
      if (!draft) { setError(''); return; }
      if (!draft.title.trim() && !tierEntryIds(draft.distribution).length) return;
      try {
        const result = await importTierListAction(draft);
        if (stopped) return;
        if (result.ok) {
          if (resolveTierImport(result.document, draft) === 'update') {
            const saved = await saveTierListAction({ publicId: result.document.publicId, version: result.document.version, title: draft.title, distribution: draft.distribution });
            if (!saved.ok) throw new Error(saved.error);
          }
          clearTierDraftIfSnapshot(JSON.stringify(draft)); setError(''); router.refresh();
          timer = setTimeout(() => void attempt(0), 1000); return;
        }
        setError(result.error);
      } catch { if (!stopped) setError('Локальный тир-лист сохранён. Повторим перенос автоматически.'); }
      if (!stopped) timer = setTimeout(() => void attempt(count + 1), Math.min(1000 * 2 ** Math.min(count, 9), 900000));
    }
    void attempt(0);
    return () => { stopped = true; clearTimeout(timer); };
  }, [authenticated, authorId, router]);
  return error ? <p role="status" className="px-4 text-sm text-stone-600">{error}</p> : null;
}
