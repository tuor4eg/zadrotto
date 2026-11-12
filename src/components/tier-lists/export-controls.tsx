'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/common/utils';
import { ToggleSwitch } from '@/components/ui/route-switch';
import { ArchiveToasts, type ArchiveToast } from '@/components/ui/archive-toasts';
import { resolveMediaItemDisplayTitles } from '@/lib/media/display-titles';
import { ArchiveCover } from '@/app/media-item-tile';
import type { TierCardItem } from '@/components/tier-lists/tier-board';
import { tierBackground, tierForeground, tierEntryIds, tierRangeError, type TierConfiguration, type TierDistribution } from '@/lib/tier-lists/model';
export function TierExportControls({ title, configuration, distribution, items, trailingContent }: { trailingContent?: ReactNode; title: string; configuration: TierConfiguration; distribution: TierDistribution; items: TierCardItem[] }) {
  const [failedCovers, setFailedCovers] = useState<Set<number>>(() => new Set());
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState(true), [header, setHeader] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ url: string; signature: string } | null>(null);
  const signature = JSON.stringify({ title, configuration, distribution, names, header, items: items.map(item => [item.id, item.coverUrl, resolveMediaItemDisplayTitles(item).displayTitle]) });
  const readyUrl = result?.signature === signature ? result.url : null;
  const [messages, setMessages] = useState<ArchiveToast[]>([]);
  const root = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  async function exportPng() {
    const node = root.current;
    if (!node || controller.current && !controller.current.signal.aborted) return;
    const abort = new AbortController();
    controller.current = abort;
    setProgress(0);
    try {
      const { exportTierListPng } = await import('@/lib/tier-lists/export');
      const blob = await exportTierListPng({ root: node, title, configuration, distribution, header, signal: abort.signal, onProgress: value => { if (!abort.signal.aborted && controller.current === abort) setProgress(Math.min(value, 0.99)); } });
      if (abort.signal.aborted) return;
      setResult({ url: URL.createObjectURL(blob), signature });
    } catch (error) {
      if (!abort.signal.aborted) setMessages([{ id: `export-${Date.now()}`, tone: 'error', text: error instanceof Error ? error.message : 'Экспорт не удался.' }]);
    } finally { if (controller.current === abort) { controller.current = null; setProgress(null); } }
  }
  const invalid = !title.trim() ? 'Введите название тир-листа.' : tierRangeError(configuration, distribution), ids = new Set(tierEntryIds(distribution));
  return <section className="flex w-full flex-col items-start gap-3" aria-label="Экспорт PNG">
    <ArchiveToasts messages={messages} />
    <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 lg:flex lg:flex-wrap">
      <Button type="button" variant="outline" className="h-9" aria-expanded={open} onClick={() => setOpen(current => !current)}>Экспорт{open ? <ChevronLeft /> : <ChevronRight />}</Button>
      {trailingContent ? <div className="min-w-0 justify-self-end lg:order-last lg:ml-auto">{trailingContent}</div> : null}
      {open ? <div className="order-last col-span-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 lg:order-none">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-3 sm:w-auto">
          <div className="flex h-9 w-28 shrink-0 items-center [&>button]:h-9 [&>button]:items-center"><ToggleSwitch checked={names} label="Названия" size="sm" pending={progress !== null} onCheckedChange={setNames} /></div>
          <div className="flex h-9 w-28 shrink-0 items-center [&>button]:h-9 [&>button]:items-center"><ToggleSwitch checked={header} label="Заголовок" size="sm" pending={progress !== null} onCheckedChange={setHeader} /></div>
        </div>
        {progress !== null ? <div className="flex flex-wrap items-center gap-3" role="status">
          <progress aria-label="Подготовка PNG" value={progress} max={1} className="h-2 w-32 accent-stone-800" />
          <span className="text-xs tabular-nums text-stone-600">{Math.round(progress * 100)}%</span>
          <Button type="button" variant="outline" size="sm" onClick={() => { controller.current?.abort(); setProgress(null); }}>Отменить</Button>
        </div> : readyUrl ? <a href={readyUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'h-9 w-48 shrink-0')}>Открыть изображение</a> : <Button type="button" variant="outline" className="h-9 w-48 shrink-0" disabled={!!invalid} title={invalid ?? undefined} onClick={() => void exportPng()}>Старт</Button>}
      </div> : null}
    </div>
    {failedCovers.size ? <p role="status" className="text-sm">Некоторые обложки недоступны и заменены заглушками.</p> : null}
    <div aria-hidden="true" ref={root} style={{ position: 'fixed', left: -10000, top: 0, width: 2208, pointerEvents: 'none' }}><Image data-export-logo unoptimized src="/site-logo.png" alt="" width={60} height={60} loading="eager" />{items.filter(item => ids.has(item.id)).map(item => <div key={item.id} onErrorCapture={() => setFailedCovers(previous => previous.has(item.id) ? previous : new Set([...previous, item.id]))} data-export-id={item.id} style={{ width: 240, padding: 8, background: tierBackground(configuration), color: tierForeground(configuration) }}><div className="h-[336px] w-full overflow-hidden"><ArchiveCover carrierFrame={false} item={item} mode="cover" className="block h-full w-full object-cover" /></div>{names ? <p data-export-title className="mt-3 text-center text-2xl leading-7 break-words">{resolveMediaItemDisplayTitles(item).displayTitle}</p> : null}</div>)}</div></section>;
}
