'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { AuthorLoginModal } from '@/app/author/login/author-login-modal';
import { ArchiveToasts, type ArchiveToast } from '@/components/ui/archive-toasts';
import type { MediaItemTileData } from '@/db/queries/media-item-tiles';
import type { AdminMediaBrowserSeriesOption } from '@/lib/admin/media-browser';
import { TierListMediaBrowserDialog } from '@/components/tier-lists/media-browser-dialog';
import type { MediaTypeOption } from '@/lib/media/types';
import { useDemoProfile } from '@/lib/user-state/use-demo-profile';
import { importTierListAction, saveTierListAction, changeTierListStatusAction, deleteTierListAction } from './actions';
import { emptyTierDistribution, resolveTierImport, tierEntryIds, tierRangeError, TIER_LIST_STORAGE_KEY, type TierListDocument, type TierListLimits, type TierTemplate, type TierLocalDraft } from '@/lib/tier-lists/model';
import { readTierDraft, replaceTierDraft, writeTierDraft, newTierRecoveryKey, tierRecoveryKey, readTierRecovery, writeTierRecovery, removeTierRecovery } from '@/lib/tier-lists/storage';
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ArchiveSelect } from '@/components/ui/archive-select'
import { Input, Label } from '@/components/ui/form'
import { TierBoard, type TierCardItem } from '@/components/tier-lists/tier-board'
export { TierPoster } from '@/components/tier-lists/tier-board';
export type { TierCardItem } from '@/components/tier-lists/tier-board';
export function TierListEditor({ templates, limits, authenticated, currentAuthorId, initial, items, mediaTypes, series }: { templates: TierTemplate[]; limits: TierListLimits; authenticated: boolean; currentAuthorId?: number; initial?: TierListDocument; items: MediaItemTileData[]; mediaTypes: MediaTypeOption[]; series: AdminMediaBrowserSeriesOption[] }) {
  const router = useRouter();
  const template = templates.find(t => t.isDefault) ?? templates[0];
  const [draft, setDraft] = useState<TierLocalDraft>(() => ({ schemaVersion: 1, clientCreationId: initial?.clientCreationId ?? '', title: initial?.title ?? '', snapshotToken: template.snapshotToken, templateId: initial?.templateId ?? template.id, configuration: initial?.configuration ?? template.configuration, distribution: initial?.distribution ?? emptyTierDistribution(template.configuration), updatedAt: new Date().toISOString() }));
  const recoveryKey = useRef<string | null>(null);
  const [unavailable, setUnavailable] = useState(initial?.unavailableCount ?? 0);
  const [unavailableIds, setUnavailableIds] = useState<number[]>(initial?.unavailableIds ?? []);
  const [document, setDocument] = useState(initial); const [metadata, setMetadata] = useState<TierCardItem[]>(items); const [browserLevel, setBrowserLevel] = useState<string | null>(null);
  const [error, setError] = useState(''); const [saved, setSaved] = useState(''); const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const [deleteOpen, setDeleteOpen] = useState(false); const [newDraftOpen, setNewDraftOpen] = useState(false); const [loginOpen, setLoginOpen] = useState(false);
  const expectedLocal = useRef<string | null>(null); const latest = useRef(draft); const server = useRef(initial); const saving = useRef(false); const stopped = useRef(false); const attempted = useRef(''); const demo = useDemoProfile();
  const [saveMessages, setSaveMessages] = useState<ArchiveToast[]>([]);
  const [pendingLink, setPendingLink] = useState<HTMLAnchorElement | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<TierTemplate | null>(null);
  const navigationConfirmed = useRef(false);
  const initialized = useRef(false);
  useEffect(() => { if (initialized.current) return; initialized.current = true; const local = !authenticated ? readTierDraft() : null; expectedLocal.current = local ? JSON.stringify(local) : null; const next = local ?? { ...latest.current, clientCreationId: latest.current.clientCreationId || crypto.randomUUID() }; setSaved(JSON.stringify(next));
    if (authenticated) {
      recoveryKey.current = initial ? tierRecoveryKey(initial.authorId, initial.publicId) : newTierRecoveryKey(undefined, currentAuthorId);
      const candidate = recoveryKey.current ? readTierRecovery(recoveryKey.current) : null;
      if (candidate && (!initial || JSON.stringify(candidate.draft.configuration) === JSON.stringify(next.configuration))) {
        setDraft(candidate.draft); latest.current = candidate.draft;
      } else {
        setDraft(next); latest.current = next;
        if (candidate && recoveryKey.current) removeTierRecovery(recoveryKey.current);
      }
      if (!initial && !candidate) recoveryKey.current = newTierRecoveryKey(next.clientCreationId, currentAuthorId);
    } else { setDraft(next); latest.current = next; }
    setReady(true); }, [authenticated, initial, currentAuthorId]);
  useEffect(() => { latest.current = draft; }, [draft]);
  const idsKey = tierEntryIds(draft.distribution).sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!ready || !idsKey) return;
    const abort = new AbortController();
    void fetch(`/api/tier-lists/items?ids=${idsKey}`, { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const result: MediaItemTileData[] = await response.json();
      setMetadata(result);
      const available = new Set(result.map(item => item.id));
      const missing = idsKey.split(',').map(Number).filter(id => !available.has(id));
      setUnavailableIds(missing); setUnavailable(missing.length);
    }).catch(() => { if (!abort.signal.aborted) setError('Не удалось загрузить обложки и оценки. Повторите загрузку страницы.'); });
    return () => abort.abort();
  }, [idsKey, ready]);
  const dirty = ready && JSON.stringify(draft) !== saved;
  useEffect(() => {
    if (!authenticated || !ready || !recoveryKey.current) return;
    if (!writeTierRecovery(recoveryKey.current, { schemaVersion: 1, baseVersion: document?.version ?? null, draft })) setError('Не удалось сохранить аварийную копию. Не закрывайте редактор до сохранения.');
  }, [authenticated, ready, draft, document?.version]);
  useEffect(() => { function warn(e: BeforeUnloadEvent) { if (dirty && !navigationConfirmed.current) e.preventDefault(); } window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.<HTMLAnchorElement>('a[href]');
      if (!dirty || navigationConfirmed.current || !anchor || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.getAttribute('href')?.startsWith('#')) return;
      event.preventDefault(); event.stopPropagation(); setPendingLink(anchor);
    };
    window.document.addEventListener('click', guard, true); return () => window.document.removeEventListener('click', guard, true);
  }, [dirty]);
  useEffect(() => { if (authenticated) return; const changed = (e: StorageEvent) => { if (e.key === TIER_LIST_STORAGE_KEY) { stopped.current = true; setError('Тир-лист изменён в другой вкладке. Ваши изменения остаются на экране; обновите страницу или сохраните PNG.'); } }; window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed); }, [authenticated]);
  const persist = useCallback(async () => {
    if (saving.current || stopped.current) return false; const snapshot = latest.current; const serialized = JSON.stringify(snapshot);
    if (authenticated && !snapshot.title.trim()) return false;
    if (authenticated && server.current?.status === 'published') { const invalid = tierRangeError(snapshot.configuration, snapshot.distribution); if (invalid) { setError(invalid); return false; } }
    saving.current = true; setBusy(true);
    try {
      if (!authenticated) { if (!writeTierDraft(snapshot, expectedLocal.current)) { stopped.current = true; setError('Не удалось сохранить локальный тир-лист. Изменения остаются на экране.'); return false; } expectedLocal.current = serialized; setSaved(serialized); setError(''); return true; }
      let result = server.current ? await saveTierListAction({ publicId: server.current.publicId, version: server.current.version, title: snapshot.title, distribution: snapshot.distribution }) : await importTierListAction(snapshot);
      if (result.ok && !server.current && resolveTierImport(result.document, snapshot) === 'update') result = await saveTierListAction({ publicId: result.document.publicId, version: result.document.version, title: snapshot.title, distribution: snapshot.distribution });
      if (!result.ok) { setError(result.error); stopped.current = /conflict|forbidden|not_found|access/i.test(result.code); return false; } server.current = result.document; setDocument(result.document); if (recoveryKey.current && recoveryKey.current !== tierRecoveryKey(result.document.authorId, result.document.publicId)) removeTierRecovery(recoveryKey.current); recoveryKey.current = tierRecoveryKey(result.document.authorId, result.document.publicId); setSaved(serialized); setError(''); return true;
    } catch { setError('Сохранение не удалось. Изменения остаются на экране.'); stopped.current = true; return false; }
    finally { saving.current = false; setBusy(false); }
  }, [authenticated]);
  useEffect(() => { if (!dirty || busy || stopped.current || authenticated && !server.current && tierEntryIds(draft.distribution).length === 0 || attempted.current === JSON.stringify(draft)) return; const timer = setTimeout(() => { attempted.current = JSON.stringify(latest.current); void persist(); }, 1000); return () => clearTimeout(timer); }, [dirty, busy, draft, persist, authenticated]);
  const update = useCallback((fn: (old: TierLocalDraft) => TierLocalDraft) => setDraft(old => { const next = { ...fn(old), updatedAt: new Date().toISOString() }; latest.current = next; return next }), []);
  const itemMap = useMemo(() => new Map(metadata.map(item => [item.id, { ...item, currentAuthorScore: authenticated ? item.currentAuthorScore : demo?.ratings[item.code]?.score ?? null }])), [metadata, authenticated, demo]); const count = tierEntryIds(draft.distribution).length;
  function applyTemplate(next: TierTemplate) {
    update(old => ({ ...old, templateId: next.id, snapshotToken: next.snapshotToken, configuration: next.configuration, distribution: emptyTierDistribution(next.configuration) }));
    setPendingTemplate(null);
  }
  function createNewDraft() {
    const next = { ...latest.current, clientCreationId: crypto.randomUUID(), title: '', distribution: emptyTierDistribution(latest.current.configuration), updatedAt: new Date().toISOString() }; stopped.current = false; attempted.current = ''; setDraft(next); latest.current = next; if (replaceTierDraft(next)) { expectedLocal.current = JSON.stringify(next); setSaved(expectedLocal.current); setError(''); } else { setError('Не удалось сохранить новый черновик в браузере.'); }
    setNewDraftOpen(false);
  }
  function openMyTierLists() {
    navigationConfirmed.current = true;
    router.push(authenticated ? '/tier-lists?view=mine' : '/tier-lists');
  }
  async function saveDraft() {
    if (saving.current) return;
    if (authenticated && !latest.current.title.trim()) { setError('Укажите название тир-листа перед сохранением.'); return; }
    const current = server.current;
    if (authenticated && current?.status === 'published') {
      setBusy(true);
      try {
        const result = await changeTierListStatusAction({ publicId: current.publicId, version: current.version, status: 'draft' });
        if (!result.ok) { setError(result.error); return; }
        server.current = result.document; setDocument(result.document); stopped.current = false; attempted.current = '';
        if (dirty && !await persist()) return;
        openMyTierLists();
      } catch { setError('Не удалось сохранить черновик. Повторите попытку.'); }
      finally { setBusy(false); }
      return;
    }
    stopped.current = false;
    const saved = await persist();
    if (saved) {
      setSaveMessages([{ id: `tier-save-${Date.now()}`, tone: 'success', text: authenticated ? 'Черновик сохранён' : 'Черновик сохранён в этом браузере' }]);
      openMyTierLists();
    }
  }
  async function publish() {
    if (saving.current) return;
    if (!latest.current.title.trim()) { setError('Укажите название тир-листа перед публикацией.'); return; }
    if (server.current?.status === 'published') { stopped.current = false; if (await persist()) openMyTierLists(); return; }
    if (!await persist()) return;
    const savedDocument = server.current; if (!savedDocument) return;
    const invalid = tierRangeError(latest.current.configuration, latest.current.distribution);
    if (invalid) { setError(invalid); return; }
    try {
      const result = await changeTierListStatusAction({ publicId: savedDocument.publicId, version: savedDocument.version, status: 'published' });
      if (!result.ok) setError(result.error); else { server.current = result.document; setDocument(result.document); openMyTierLists(); }
    } catch { setError('Публикация не удалась. Повторите попытку.'); }
  }
  async function removeList() {
    if (!document || saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const result = await deleteTierListAction({ publicId: document.publicId, version: document.version });
      if (!result.ok) { setError(result.error); setDeleteOpen(false); return; }
      setDeleteOpen(false);
      router.push('/tier-lists');
    } catch { setError('Удаление не удалось. Повторите попытку.'); setDeleteOpen(false); }
    finally { saving.current = false; setBusy(false); }
  }
  if (!ready) return <p>Загрузка редактора…</p>;
  return <div className="space-y-4"><ArchiveToasts messages={error ? [{ id: `tier-error-${error}`, tone: 'error', text: error }] : saveMessages} />{!authenticated ? <p className="text-sm text-stone-600">Черновик сохраняется в этом браузере. Чтобы сохранить его в аккаунте, войдите.</p> : null}{unavailable ? <div role="status" className="rounded border p-3">Недоступных записей: {unavailable}. Они не попадут на публичную страницу и в PNG.<button onClick={() => { const missing = new Set(unavailableIds); setUnavailable(0); setUnavailableIds([]); update(old => ({...old, distribution: Object.fromEntries(Object.entries(old.distribution).map(([key, ids]) => [key, ids.filter(id => !missing.has(id))]))})); }}>Очистить недоступные записи и сохранить</button></div> : null}<div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_18rem]"><div className="grid min-w-0 gap-2"><Label htmlFor="tier-list-title">Название</Label><div><Input id="tier-list-title" maxLength={80} value={draft.title} onChange={event => update(old => ({ ...old, title: event.target.value }))} /><p className="mt-1 text-left text-xs text-stone-500">{draft.title.length}/80</p></div></div><div className="grid min-w-0 gap-2"><Label>Шаблон</Label><ArchiveSelect ariaLabel="Шаблон" className="w-full" triggerClassName="h-10 w-full min-w-0 justify-between" onChange={value => { const next = templates.find(template => template.id === Number(value)); if (!next || next.id === draft.templateId) return; if (tierEntryIds(draft.distribution).length > 0) { setPendingTemplate(next); return; } applyTemplate(next) }} options={[...(templates.some(template => template.id === draft.templateId) ? [] : [{ label: 'Сохранённый шаблон', value: String(draft.templateId) }]), ...templates.map(template => ({ label: template.name, value: String(template.id) }))]} value={String(draft.templateId)} /></div></div>{error ? <p role="alert" className="text-sm">{error}</p> : null}
    <TierBoard posterOnly configuration={draft.configuration} distribution={draft.distribution} items={[...itemMap.values()]} maxEntries={limits.maxEntries} onChange={distribution => update(old => ({ ...old, distribution }))} onAdd={setBrowserLevel} />
    {browserLevel ? <TierListMediaBrowserDialog excludedIds={tierEntryIds(draft.distribution)} maxSelection={Math.max(0, limits.maxEntries - count)} mediaTypes={mediaTypes} series={series} onClose={() => setBrowserLevel(null)} onConfirm={(selected) => { const level = browserLevel; const chosen = selected.slice(0, Math.max(0, limits.maxEntries - count)); setMetadata(old => [...old, ...chosen.map(i => ({ ...i, mediaCarrierCode: null }))]); update(old => ({ ...old, distribution: { ...old.distribution, [level]: [...(old.distribution[level] ?? []), ...chosen.map(i => i.id)] } })); setBrowserLevel(null); }} /> : null}
    <div className="flex flex-wrap justify-end gap-2">{document ? <Button variant="destructive" disabled={busy} onClick={() => setDeleteOpen(true)}>Удалить</Button> : null}<Button variant="outline" className="cursor-pointer hover:border-stone-500 hover:bg-stone-200 hover:text-stone-950" disabled={busy || error.includes('другой вкладке')} onClick={() => void saveDraft()}>{busy ? 'Сохраняем…' : 'Сохранить черновик'}</Button>{authenticated ? <Button variant="positive" disabled={busy || error.includes('другой вкладке')} onClick={() => void publish()}>Опубликовать</Button> : <Button variant="positive" disabled={busy || error.includes('другой вкладке')} onClick={async () => { stopped.current = false; if (await persist()) setLoginOpen(true); }}>Войти и перенести тир-лист</Button>}{!authenticated ? <Button variant="outline" className="cursor-pointer hover:border-stone-500 hover:bg-stone-200 hover:text-stone-950" disabled={busy} onClick={() => setNewDraftOpen(true)}>Новый тир-лист</Button> : null}</div>{pendingLink ? <ConfirmDialog variant="archive" title="Покинуть редактор?" description="Есть несохранённые изменения. При переходе они могут быть потеряны." onClose={() => setPendingLink(null)}><Button variant="destructive" onClick={() => { const anchor = pendingLink; navigationConfirmed.current = true; setPendingLink(null); anchor.click(); }}>Покинуть редактор</Button></ConfirmDialog> : null}{pendingTemplate ? <ConfirmDialog variant="archive" title="Сменить шаблон?" description="Записи будут удалены из уровней. Это действие нельзя отменить." onClose={() => setPendingTemplate(null)}><Button variant="destructive" onClick={() => applyTemplate(pendingTemplate)}>Сменить шаблон</Button></ConfirmDialog> : null}{loginOpen ? createPortal(<AuthorLoginModal onClose={() => setLoginOpen(false)} onSuccess={() => { setLoginOpen(false); router.refresh(); }} />, window.document.body) : null}{newDraftOpen ? <ConfirmDialog variant="archive" title="Создать новый тир-лист?" description="Текущий локальный черновик будет заменён пустым тир-листом. Вернуть его после замены не получится." onClose={() => setNewDraftOpen(false)}><Button variant="destructive" onClick={createNewDraft}>Создать новый</Button></ConfirmDialog> : null}{deleteOpen && document ? <ConfirmDialog variant="archive" title="Удалить тир-лист?" description={draft.title.trim() ? `Тир-лист «${draft.title.trim()}» будет удалён без возможности восстановления.` : 'Тир-лист будет удалён без возможности восстановления.'} onClose={() => { if (!busy) setDeleteOpen(false) }}><Button variant="destructive" disabled={busy} onClick={() => void removeList()}>Удалить</Button></ConfirmDialog> : null}</div>;
}
