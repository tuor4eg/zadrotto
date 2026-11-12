'use client';

import { memo, useMemo, useState, type ReactNode } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, X } from 'lucide-react';
import { ArchiveCover } from '@/app/media-item-tile';
import { Select } from '@/components/ui/form';
import type { MediaItemTileData } from '@/db/queries/media-item-tiles';
import { resolveMediaItemDisplayTitles } from '@/lib/media/display-titles';
import { formatScore } from '@/lib/ratings/score';
import { AUTHOR_RATING_TONE_CLASS_NAMES, getRatingTone } from '@/lib/ratings/tone';
import { tierBackground, tierEntryIds, tierForeground, type TierConfiguration, type TierDistribution } from '@/lib/tier-lists/model';

export type TierCardItem = Pick<MediaItemTileData, 'id' | 'code' | 'title' | 'coverUrl' | 'mediaType' | 'metadataFacts' | 'mediaCarrierCode'> & Partial<Pick<MediaItemTileData, 'aliases' | 'originalTitle'>> & { currentAuthorScore?: number | null };
export const TierPoster = memo(function TierPoster({ item, names = true, ratings = true, posterOnly = false }: { item: TierCardItem; names?: boolean; ratings?: boolean; posterOnly?: boolean }) {
  const { displayTitle } = resolveMediaItemDisplayTitles(item);
  if (posterOnly) return <div className="relative aspect-[2/3] w-full min-w-0 shrink-0 overflow-hidden sm:w-36"><ArchiveCover item={item} carrierFrame={false} mode="contain" className="block h-full w-full object-contain" />{names ? <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2 pb-2 pt-8 text-left text-sm leading-snug text-white"><span className="line-clamp-3 break-words">{displayTitle}</span></span> : null}</div>;
  return <div className="w-24 shrink-0"><ArchiveCover item={item} carrierFrameSize="compact" />{names ? <p className="mt-1 break-words text-xs">{displayTitle}</p> : null}{ratings && item.currentAuthorScore != null ? <p className={`text-xs ${AUTHOR_RATING_TONE_CLASS_NAMES[getRatingTone(item.currentAuthorScore)]}`}>{formatScore(item.currentAuthorScore)}</p> : null}</div>;
});

type Move = (id: number, level: string, position?: number) => void;
const SortableCard = memo(function SortableCard({ item, configuration, levelId, move, remove, disabled, posterOnly }: { item: TierCardItem; configuration: TierConfiguration; levelId: string; move: Move; remove: (id: number) => void; disabled: boolean; posterOnly: boolean }) {
  const { displayTitle } = resolveMediaItemDisplayTitles(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled });
  if (posterOnly) return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }} className="relative w-[calc((100%_-_0.75rem)/2)] shrink-0 sm:w-36">
    <button type="button" disabled={disabled} {...attributes} {...listeners} aria-label={`Перетащить запись «${displayTitle}»`} onDragStart={event => event.preventDefault()} className="relative block w-full touch-none sm:w-36 cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default [&_img]:pointer-events-none [&_img]:select-none">
      <TierPoster item={item} posterOnly />
    </button>
    <button type="button" disabled={disabled} onClick={() => remove(item.id)} aria-label={`Удалить запись «${displayTitle}»`} title="Удалить запись" className="absolute right-1 top-1 z-10 grid size-7 cursor-pointer place-items-center rounded-full border border-stone-200/60 bg-white/60 text-stone-600 shadow-sm transition-colors hover:bg-white/85 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"><X className="size-4" /></button>
  </div>;
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="relative w-28 shrink-0 rounded border border-stone-200 bg-white p-2">
    <button type="button" disabled={disabled} {...attributes} {...listeners} className="flex min-h-9 touch-none cursor-grab items-center text-xs disabled:cursor-default" aria-label={`Перетащить: ${displayTitle}`}>⠿ Переместить</button>
    <TierPoster item={item} />
    <Select disabled={disabled} aria-label={`Уровень: ${displayTitle}`} value={levelId} onChange={event => move(item.id, event.target.value)} className="mt-2 h-9 px-1 text-xs">{configuration.levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</Select>
    <div className="mt-1 flex items-center justify-between"><button type="button" disabled={disabled} className="min-h-9 px-1" aria-label={`Раньше: ${displayTitle}`} onClick={() => move(item.id, levelId, -1)}>←</button><button type="button" disabled={disabled} className="min-h-9 text-xs" onClick={() => remove(item.id)}>Убрать</button><button type="button" disabled={disabled} className="min-h-9 px-1" aria-label={`Позже: ${displayTitle}`} onClick={() => move(item.id, levelId, -2)}>→</button></div>
  </div>;
});
function TierRow({ levelId, levelName, levelColor, backgroundColor, foregroundColor, addDisabled, onAdd, children }: { levelId: string; levelName: string; levelColor: string; backgroundColor: string; foregroundColor: string; addDisabled: boolean; onAdd: () => void; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `level:${levelId}` })
  return <section className={`overflow-hidden sm:flex ${isOver ? 'ring-2 ring-inset ring-stone-50' : ''}`}>
    <h2 style={{ backgroundColor: levelColor }} className="flex shrink-0 items-center justify-center break-words border-b border-black p-3 text-center font-bold text-stone-950 sm:w-24 sm:border-b-0 sm:border-r">{levelName}</h2>
    <div ref={setNodeRef} className="flex min-h-28 min-w-0 flex-1" style={{ backgroundColor, color: foregroundColor }}>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3 p-3 text-stone-950">{children}</div>
      <button type="button" disabled={addDisabled} onClick={onAdd} aria-label={`Добавить записи в уровень ${levelName}`} className="flex w-12 shrink-0 items-center justify-center border-l border-black transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-40"><Plus className="size-5" /></button>
    </div>
  </section>
}

export type TierBoardProps = { configuration: TierConfiguration; distribution: TierDistribution; items: readonly TierCardItem[]; maxEntries: number; disabled?: boolean; posterOnly?: boolean; onChange: (distribution: TierDistribution) => void; onAdd: (levelId: string) => void };
export function TierBoard({ configuration, distribution, items, maxEntries, disabled = false, posterOnly = false, onChange, onAdd }: TierBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const itemMap = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const count = tierEntryIds(distribution).length;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function move(id: number, level: string, target?: number) {
    if (disabled || !distribution[level]) return;
    const from = configuration.levels.find(row => distribution[row.id].includes(id))?.id;
    if (!from) return;
    const previous = distribution[from].indexOf(id);
    const next = Object.fromEntries(Object.entries(distribution).map(([key, ids]) => [key, ids.filter(value => value !== id)]));
    const index = target === undefined ? next[level].length : target === -1 ? previous - 1 : target === -2 ? previous + 1 : target;
    next[level].splice(Math.max(0, Math.min(next[level].length, index)), 0, id);
    onChange(next);
  }
  function endDrag({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const target = String(over.id);
    const level = target.startsWith('level:') ? target.slice(6) : configuration.levels.find(row => distribution[row.id].includes(Number(over.id)))?.id;
    if (level) move(Number(active.id), level, target.startsWith('level:') ? undefined : distribution[level].indexOf(Number(over.id)));
  }
  const backgroundColor = tierBackground(configuration)
  const foregroundColor = tierForeground(configuration)
  return <div className="overflow-hidden border border-black divide-y divide-black"><DndContext sensors={sensors} onDragStart={({ active }) => setActiveId(Number(active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={endDrag}>
    {configuration.levels.map(level => <SortableContext key={level.id} items={distribution[level.id]} strategy={rectSortingStrategy}><TierRow levelId={level.id} levelName={level.name} levelColor={level.color} backgroundColor={backgroundColor} foregroundColor={foregroundColor} addDisabled={disabled || count >= maxEntries} onAdd={() => onAdd(level.id)}>{distribution[level.id].map(id => <SortableCard key={id} item={itemMap.get(id) ?? { id, code: '', title: 'Запись недоступна', coverUrl: null, mediaType: 'film', metadataFacts: null, mediaCarrierCode: null }} configuration={configuration} levelId={level.id} move={move} remove={id => { if (!disabled) onChange(Object.fromEntries(Object.entries(distribution).map(([key, ids]) => [key, ids.filter(value => value !== id)]))); }} disabled={disabled} posterOnly={posterOnly} />)}</TierRow></SortableContext>)}
    <DragOverlay>{activeId && itemMap.get(activeId) ? <TierPoster item={itemMap.get(activeId)!} posterOnly={posterOnly} /> : null}</DragOverlay>
  </DndContext></div>;
}
