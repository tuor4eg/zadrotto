'use client';

import Link from 'next/link';
import { Edit3 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { EditorialEntryGroupTile } from '@/components/archive/editorial-entry-group-tile';
import { TierExportControls } from '@/components/tier-lists/export-controls';
import type { MediaItemTileData } from '@/db/queries/media-item-tiles';
import { tierBackground, tierForeground, tierEntryIds, visibleTierLevels, type TierLocalDraft } from '@/lib/tier-lists/model';
import { useLocalTierDraft } from '../local-tier-draft-card';

export function LocalTierPreview({ author }: { author: { name: string; code: string } | null }) {
  const snapshot = useLocalTierDraft();
  const draft: TierLocalDraft | null = snapshot ? JSON.parse(snapshot) : null;
  const idsKey = draft ? tierEntryIds(draft.distribution).join(',') : '';
  const [loaded, setLoaded] = useState<{ key: string; items: MediaItemTileData[] } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!idsKey) return;
    const abort = new AbortController();
    void fetch(`/api/tier-lists/items?ids=${idsKey}`, { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Не удалось загрузить записи.');
      const items: MediaItemTileData[] = await response.json();
      if (!abort.signal.aborted) { setLoaded({ key: idsKey, items }); setFailedKey(null); }
    }).catch(() => { if (!abort.signal.aborted) setFailedKey(idsKey); });
    return () => abort.abort();
  }, [idsKey]);

  if (!draft) return <div className="p-4 sm:p-6"><p>В этом браузере нет сохранённого тир-листа.</p><Link href="/tier-lists" className="underline">К тир-листам</Link></div>;
  const title = draft.title.trim() || 'Без названия';
  const loading = !!idsKey && loaded?.key !== idsKey;
  const items = loaded?.key === idsKey ? loaded.items : [];
  const byId = new Map(items.map(item => [item.id, item]));
  const distribution = Object.fromEntries(Object.entries(draft.distribution).map(([key, ids]) => [key, ids.filter(id => byId.has(id))]));
  return <div className="grid gap-5 p-4 sm:p-6">
    <header>
      <nav aria-label="Хлебные крошки" className="media-carrier-font-pc-steam mb-2 break-words text-xs lowercase text-stone-600"><Link href="/tier-lists" className="hover:text-red-950">Тир-листы</Link><span aria-hidden="true"> / </span><span aria-current="page">{title}</span></nav>
      <div className="mt-2 flex min-w-0 items-start gap-2"><h1 className="min-w-0 break-words text-3xl font-bold">{title}</h1><Link href="/tier-lists/new" aria-label="Редактировать" title="Редактировать" className={`${buttonVariants({ variant: 'outline', size: 'icon' })} shrink-0`}><Edit3 className="size-4" /></Link></div>
      <p className="mt-2 text-sm text-stone-600">Локальный черновик. Сохранён только в этом браузере.</p>
      {!loading ? <div className="mt-4"><TierExportControls title={draft.title} configuration={draft.configuration} distribution={distribution} items={items} /></div> : null}
    </header>
    {loading ? <p role="status">{failedKey === idsKey ? 'Не удалось загрузить записи. Обновите страницу.' : 'Загружаем записи…'}</p> : <>
      {tierEntryIds(draft.distribution).length > items.length ? <p role="status" className="text-sm text-stone-600">Некоторые записи недоступны и скрыты.</p> : null}
      <div className="overflow-hidden border border-black divide-y divide-black">{visibleTierLevels(draft.configuration, distribution).map(level => <section key={level.id} className="overflow-hidden sm:flex">
        <h2 style={{ backgroundColor: level.color }} className="flex shrink-0 items-center justify-center break-words border-b border-black p-3 font-bold text-stone-950 sm:w-24 sm:border-r sm:border-b-0">{level.name}</h2>
        <div style={{ backgroundColor: tierBackground(draft.configuration), color: tierForeground(draft.configuration) }} className="flex flex-1 flex-wrap items-start gap-3 p-3">{distribution[level.id].map(id => { const item = byId.get(id)!; return <div key={id} className="w-32 min-w-0 sm:w-36 [&_a.group]:border-0"><EditorialEntryGroupTile item={item} currentAuthorStatus={null} currentAuthor={Boolean(author)} ratingAuthor={author} horizontalScroll={false} showMetadata={false} showDemoRating={false} /></div>; })}</div>
      </section>)}</div>
    </>}
  </div>;
}
