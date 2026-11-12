'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';
import { AdminMediaBrowser } from '@/components/admin/admin-media-browser';
import { TierBoard } from '@/components/tier-lists/tier-board';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import type { MediaItemTileData } from '@/db/queries/media-item-tiles';
import type { AdminMediaBrowserSeriesOption } from '@/lib/admin/media-browser';
import type { MediaTypeOption } from '@/lib/media/types';
import { emptyTierDistribution, sameTierDistribution, tierEntryIds, tierRangeError, type TierDistribution, type TierListDocument, type TierListLimits, type TierTemplate } from '@/lib/tier-lists/model';
import { AdminToasts, type AdminToast } from '../admin-toasts';
import { getAdminTierListItemsAction, saveAdminTierListAction, searchTierListAdminAuthorsAction } from './actions';

type AuthorOption = { id: number; name: string; isSystem: boolean };
export type TierListFormProps = { templates: TierTemplate[]; limits: TierListLimits; defaultAuthor: AuthorOption; initial?: TierListDocument; items: MediaItemTileData[]; mediaTypes: MediaTypeOption[]; series: AdminMediaBrowserSeriesOption[] };

export function TierListForm({ templates, limits, defaultAuthor, initial, items, mediaTypes, series }: TierListFormProps) {
  const router = useRouter();
  const [savedDocument, setSavedDocument] = useState(initial);
  const defaultTemplate = templates.find(template => template.isDefault) ?? templates[0];
  const [templateId, setTemplateId] = useState(initial?.templateId ?? defaultTemplate?.id ?? 0);
  const [configuration, setConfiguration] = useState(initial?.configuration ?? defaultTemplate?.configuration);
  const [distribution, setDistribution] = useState<TierDistribution>(initial?.distribution ?? (defaultTemplate ? emptyTierDistribution(defaultTemplate.configuration) : {}));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [status, setStatus] = useState<'draft' | 'published'>(initial?.status ?? 'draft');
  const [author, setAuthor] = useState(defaultAuthor);
  const [query, setQuery] = useState('');
  const [authorOptions, setAuthorOptions] = useState<AuthorOption[]>([]);
  const [searchingAuthors, setSearchingAuthors] = useState(false);
  const [metadata, setMetadata] = useState(items);
  const [loadingItems, setLoadingItems] = useState(false);
  const [hydratedAuthorId, setHydratedAuthorId] = useState(defaultAuthor.id);
  const [missingIds, setMissingIds] = useState<number[]>(initial?.unavailableIds ?? []);
  const [browserLevel, setBrowserLevel] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<AdminToast[]>([]);
  const toastNumber = useRef(0);
  const creationId = useRef(initial?.clientCreationId ?? '');
  const [baseline, setBaseline] = useState(() => JSON.stringify({ title: initial?.title ?? '', status: initial?.status ?? 'draft', authorId: defaultAuthor.id, templateId: initial?.templateId ?? defaultTemplate?.id ?? 0, distribution: initial?.distribution ?? (defaultTemplate ? emptyTierDistribution(defaultTemplate.configuration) : {}) }));
  const dirty = JSON.stringify({ title, status, authorId: author.id, templateId, distribution }) !== baseline;
  const ids = tierEntryIds(distribution);
  const idsKey = [...ids].sort((a, b) => a - b).join(',');
  const canSave = !pending && !loadingItems && hydratedAuthorId === author.id && !!configuration;

  function report(text: string) { setMessages([{ id: `tier-form-${++toastNumber.current}`, tone: 'error', text }]); }

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) { if (dirty) event.preventDefault(); }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    let active = true;
    const timer = setTimeout(async () => {
      setSearchingAuthors(true);
      try { const result = await searchTierListAdminAuthorsAction(trimmed); if (active) setAuthorOptions(result); }
      catch { if (active) setMessages([{ id: `author-search-${++toastNumber.current}`, tone: 'error', text: 'Не удалось найти авторов. Повторите поиск.' }]); }
      finally { if (active) setSearchingAuthors(false); }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    let active = true;
    const ids = idsKey ? idsKey.split(',').map(Number) : [];
    async function hydrate() {
      setLoadingItems(true);
      try {
        const result = await getAdminTierListItemsAction({ ids, authorId: author.id });
        if (!active) return;
        const available = new Set(result.map(item => item.id));
        setMetadata(result); setMissingIds(ids.filter(id => !available.has(id))); setHydratedAuthorId(author.id);
      } catch { if (active) setMessages([{ id: `tier-items-${++toastNumber.current}`, tone: 'error', text: 'Не удалось загрузить записи и оценки автора. Повторите выбор автора или загрузку страницы.' }]); }
      finally { if (active) setLoadingItems(false); }
    }
    void hydrate();
    return () => { active = false; };
  }, [idsKey, author.id]);

  useEffect(() => {
    if (browserLevel === null) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function close(event: KeyboardEvent) { if (event.key === 'Escape') setBrowserLevel(null); }
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', close); };
  }, [browserLevel]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !configuration) return;
    if (status === 'published') { const error = tierRangeError(configuration, distribution); if (error) { report(error); return; } }
    const submittedBaseline = JSON.stringify({ title, status, authorId: author.id, templateId, distribution });
    setPending(true);
    try {
      creationId.current ||= crypto.randomUUID();
      const result = await saveAdminTierListAction({ publicId: savedDocument?.publicId, version: savedDocument?.version, clientCreationId: creationId.current, authorId: author.id, templateId, title, distribution, status });
      if (!result.ok) { report(result.error); return; }
      if (!savedDocument && (result.document.title !== title.trim() || result.document.authorId !== author.id || result.document.status !== status || !sameTierDistribution(result.document.distribution, distribution))) {
        report('Этот запрос уже создал тир-лист с другими данными. Откройте его из списка для редактирования; текущие изменения остаются в форме.');
        return;
      }
      setSavedDocument(result.document);
      setBaseline(submittedBaseline);
      router.replace(`/admin/tier-lists/${result.document.publicId}/edit?saved=1`);
    } catch { report('Не удалось сохранить тир-лист. Изменения остаются в редакторе.'); }
    finally { setPending(false); }
  }

  return <form onSubmit={event => void submit(event)} className="grid gap-6">
    <AdminToasts messages={messages} />
    <section className="grid gap-4 rounded-md border bg-white p-5">
      <label className="grid gap-2 text-sm font-medium">Название<Input required maxLength={80} value={title} disabled={pending} onChange={event => setTitle(event.target.value)} /></label>
      <div className="grid gap-2"><span className="text-sm font-medium">Автор</span><p className="text-sm">{author.name}{author.isSystem ? ' · системный автор' : ''}</p><Input aria-label="Найти автора" placeholder="Поиск по имени автора" value={query} disabled={pending} onChange={event => { setQuery(event.target.value); setAuthorOptions([]); setSearchingAuthors(false); }} />
        {query.trim() ? <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2" aria-label="Результаты поиска авторов">{searchingAuthors ? <p className="p-2 text-sm text-stone-500" role="status">Поиск…</p> : authorOptions.length ? authorOptions.map(option => <Button key={option.id} type="button" variant="ghost" disabled={pending} className="justify-start whitespace-normal text-left" onClick={() => { setAuthor(option); setQuery(''); setAuthorOptions([]); }}>{option.name}{option.isSystem ? ' · системный автор' : ''}</Button>) : <p className="p-2 text-sm text-stone-500">Авторов не найдено.</p>}</div> : null}
        {author.id !== defaultAuthor.id ? <Button type="button" variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => setAuthor(defaultAuthor)}>Выбрать {defaultAuthor.name}</Button> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Статус<Select value={status} disabled={pending} onChange={event => setStatus(event.target.value as 'draft' | 'published')}><option value="draft">Черновик</option><option value="published">Опубликован</option></Select></label>
        <label className="grid gap-2 text-sm font-medium">Шаблон<Select value={templateId} disabled={pending || !!savedDocument || ids.length > 0} onChange={event => { const next = templates.find(template => template.id === Number(event.target.value)); if (!next) return; setTemplateId(next.id); setConfiguration(next.configuration); setDistribution(emptyTierDistribution(next.configuration)); }}>{savedDocument && !templates.some(template => template.id === templateId) ? <option value={templateId}>Сохранённый шаблон</option> : null}{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></label></div>
      <p className="text-xs text-stone-500">Уровни и цвета сохраняются вместе с тир-листом. Изменение исходного шаблона не меняет этот список.</p>
      {savedDocument?.hiddenAt ? <p className="text-sm text-stone-600">Тир-лист скрыт модератором. Сохранение не снимает скрытие.</p> : null}
    </section>
    {missingIds.length ? <div role="status" className="flex flex-wrap items-center gap-3 rounded border border-stone-200 p-4 text-sm"><span>Недоступных записей: {missingIds.length}. Удалите их перед сохранением.</span><Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => { const missing = new Set(missingIds); setDistribution(old => Object.fromEntries(Object.entries(old).map(([key, values]) => [key, values.filter(id => !missing.has(id))]))); }}>Очистить недоступные записи</Button></div> : null}
    <section className="grid gap-3"><div><h2 className="text-xl font-semibold">Распределение записей</h2><p className="text-sm text-stone-500">{ids.length}/{limits.maxEntries} записей{loadingItems ? ' · Загружаем оценки автора…' : ''}. Перетаскивайте записи, выбирайте уровень или используйте стрелки.</p></div>{configuration ? <TierBoard posterOnly configuration={configuration} distribution={distribution} items={metadata} maxEntries={limits.maxEntries} disabled={pending} onChange={setDistribution} onAdd={setBrowserLevel} /> : <p className="text-sm text-stone-500">Сначала создайте шаблон тир-листа в настройках.</p>}</section>
    <div className="flex flex-wrap items-center gap-3">{savedDocument?.status === 'published' && !savedDocument.hiddenAt ? <Link className={buttonVariants({variant:'outline'})} href={`/tier-lists/${savedDocument.publicId}`}>Открыть на сайте</Link> : null}<Button type="submit" disabled={!canSave}>{pending ? 'Сохраняем…' : 'Сохранить'}</Button><span className="text-sm text-stone-500">{dirty ? 'Есть несохранённые изменения' : 'Изменений нет'}</span></div>
    {browserLevel !== null ? createPortal(<div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/55 p-3 sm:p-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setBrowserLevel(null); }}><div role="dialog" aria-modal="true" aria-labelledby="tier-media-browser-title" className="grid max-h-[calc(100vh-1.5rem)] w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]"><header className="flex items-center justify-between gap-3 border-b px-4 py-3"><h2 id="tier-media-browser-title" className="text-lg font-semibold">Добавить записи</h2><Button type="button" variant="ghost" size="icon" aria-label="Закрыть" onClick={() => setBrowserLevel(null)}><X /></Button></header><div className="overflow-y-auto p-3 sm:p-5"><AdminMediaBrowser pageSize={48} maxSelection={Math.max(0, limits.maxEntries - ids.length)} excludedIds={ids} mediaTypes={mediaTypes} series={series} onConfirm={selected => { if (selected.length + ids.length > limits.maxEntries) { report(`В тир-листе может быть не больше ${limits.maxEntries} записей.`); return false; } const target = browserLevel; setDistribution(old => ({ ...old, [target]: [...old[target], ...selected.map(item => item.id)] })); setBrowserLevel(null); }} /></div></div></div>, document.body) : null}
  </form>;
}
