"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Trash2, X } from "lucide-react";

import { CoverPreview } from "@/app/author/(protected)/media/cover-preview";
import { AdminMediaBrowser } from "@/components/admin/admin-media-browser";
import { EditorialDocumentEditor, type EditorialDocumentBlock } from "@/components/admin/editorial-document-editor";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import type { AdminMediaBrowserSeriesOption } from "@/lib/admin/media-browser";
import { cn } from "@/lib/common/utils";
import type { EditorialDocumentLimits } from "@/lib/editorial-documents/model";
import type { MediaTypeOption } from "@/lib/media/types";
import type { CollectionFormState } from "./actions";
import { AdminToasts } from "../admin-toasts";

export function CollectionForm({ action, initial, mediaTypes, series, limits }: {
  action: (state: CollectionFormState, form: FormData) => Promise<CollectionFormState>;
  limits: EditorialDocumentLimits;
  initial?: { id: number; title: string; description: string | null; coverUrl: string | null; blocks: EditorialDocumentBlock[] };
  mediaTypes: readonly MediaTypeOption[];
  series: readonly AdminMediaBrowserSeriesOption[];
}) {
  const [state, formAction, pending] = useActionState(action, { error: null, submissionId: 0 });
  const [blocks, setBlocks] = useState<EditorialDocumentBlock[]>(initial?.blocks ?? []);
  const [browserTarget, setBrowserTarget] = useState<{ type: "media"; index: number } | { type: "entry_group"; clientId: string } | null>(null);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState(initial?.coverUrl ?? null);
  const localUrl = useRef<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  useEffect(() => () => { if (localUrl.current) URL.revokeObjectURL(localUrl.current); }, []);
  useEffect(() => {
    if (browserTarget === null) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setBrowserTarget(null); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [browserTarget]);

  const serializedBlocks = blocks.map((block) => block.type === "media"
    ? { type: "media", mediaItemId: block.item.id, editorialComment: block.editorialComment }
    : block.type === "entry_group"
      ? { type: "entry_group", title: block.title.trim() || null, description: block.description.trim() || null, mediaItemIds: block.items.map((item) => item.id) }
      : { type: block.type, content: block.content });
  const hasEmptyContentBlock = blocks.some((block) => (block.type === "heading" || block.type === "text") && !block.content.trim());
  const hasEmptyGroup = blocks.some((block) => block.type === "entry_group" && block.items.length === 0);
  const selectedMediaIds = blocks.flatMap((block) => block.type === "media" ? [block.item.id] : block.type === "entry_group" ? block.items.map((item) => item.id) : []);

  function changeBlocks(nextBlocks: EditorialDocumentBlock[]) {
    if (nextBlocks.length > limits.maxBlocks && nextBlocks.length > blocks.length) {
      setEditorError(`В подборке может быть не больше ${limits.maxBlocks} блоков.`);
      return;
    }
    setEditorError(null);
    setBlocks(nextBlocks);
  }

  return <form action={formAction} className="grid gap-6">
    {initial ? <input type="hidden" name="collectionId" value={initial.id} /> : null}
    <input type="hidden" name="removeImage" value={removeImage ? "1" : "0"} />
    <input type="hidden" name="blocks" value={JSON.stringify(serializedBlocks)} />
    <AdminToasts messages={state.error ? [{ id: `save-error-${state.submissionId}`, tone: "error", text: state.error }] : []} />
    <section className="grid w-full gap-4 rounded-md border bg-white p-5">
      <label className="grid gap-2 text-sm font-medium">Название<Input name="title" required maxLength={200} defaultValue={initial?.title ?? ""} /></label>
      <label className="grid gap-2 text-sm font-medium">Описание<textarea name="description" maxLength={10000} defaultValue={initial?.description ?? ""} className="min-h-36 rounded-md border border-stone-300 p-3 font-normal" /></label>
      <div className="grid gap-2"><span className="text-sm font-medium">Обложка</span>
        {previewUrl ? <CoverPreview src={previewUrl} alt="Обложка подборки" buttonClassName="block w-fit rounded-md border border-stone-200 bg-white p-1 text-left transition-colors hover:border-stone-400" thumbnailClassName="h-28 w-20 rounded object-cover" /> : <span className="grid h-28 w-20 place-items-center rounded border border-dashed border-stone-300 bg-stone-100 px-2 text-center text-xs font-normal text-stone-500">Без обложки</span>}
        <div className="flex gap-2"><label className={cn(buttonVariants({ size: "sm" }), "cursor-pointer")}><ImagePlus />Выбрать файл<input className="sr-only" type="file" name="imageFile" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; if (localUrl.current) URL.revokeObjectURL(localUrl.current); localUrl.current = URL.createObjectURL(file); setPreviewUrl(localUrl.current); setRemoveImage(false); }} /></label>
          {previewUrl ? <Button type="button" size="sm" variant="outline" onClick={() => { setPreviewUrl(null); setRemoveImage(true); }}><Trash2 />Убрать</Button> : null}</div>
        <p className="text-xs text-stone-500">Необязательно. JPG, PNG или WebP до 5 МБ; изображение будет обрезано до 16:9.</p>
      </div>
    </section>
    <section className="grid gap-3">
      <div><h2 className="text-xl font-semibold">Содержимое</h2><p className="text-sm text-stone-500">До {limits.maxBlocks} блоков и {limits.maxEntries} записей, включая записи внутри наборов. Добавляйте блоки кнопками между элементами.</p></div>
      {editorError ? <p role="alert" className="text-sm text-red-800">{editorError}</p> : null}
      <EditorialDocumentEditor blocks={blocks} onChange={changeBlocks} onRequestMediaInsert={(index) => { setBrowserError(null); setBrowserTarget({ type: "media", index }); }} onRequestGroupMediaInsert={(clientId) => { setBrowserError(null); setBrowserTarget({ type: "entry_group", clientId }); }} />
    </section>
    {browserTarget !== null ? createPortal(
      <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/55 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBrowserTarget(null); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="collection-media-browser-title" className="grid max-h-[calc(100vh-1.5rem)] w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]">
          <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-4 py-3 sm:px-5"><div><h2 id="collection-media-browser-title" className="text-lg font-semibold">{browserTarget.type === "entry_group" ? "Добавить записи в набор" : "Добавить записи"}</h2><p className="mt-1 text-sm text-stone-500">Выберите одну или несколько записей архива.</p></div><Button type="button" variant="ghost" size="icon" aria-label="Закрыть" onClick={() => setBrowserTarget(null)}><X /></Button></header>
          <div className="overflow-y-auto p-3 sm:p-5">{browserError ? <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{browserError}</p> : null}<AdminMediaBrowser excludedIds={selectedMediaIds} mediaTypes={mediaTypes} series={series} onConfirm={(selected) => {
            if (selectedMediaIds.length + selected.length > limits.maxEntries) {
              setBrowserError(`В подборке может быть не больше ${limits.maxEntries} записей, включая наборы. Уменьшите выбор.`);
              return false;
            }
            if (browserTarget.type === "media" && blocks.length + selected.length > limits.maxBlocks) {
              setBrowserError(`В подборке может быть не больше ${limits.maxBlocks} блоков. Уменьшите выбор.`);
              return false;
            }
            if (browserTarget.type === "entry_group") {
              const targetId = browserTarget.clientId;
              if (!blocks.some((block) => block.type === "entry_group" && block.clientId === targetId)) {
                setBrowserError("Набор больше не существует. Закройте окно и выберите блок заново.");
                return false;
              }
              setBlocks((current) => current.map((block) => block.type === "entry_group" && block.clientId === targetId ? { ...block, items: [...block.items, ...selected] } : block));
            } else {
              const insertIndex = browserTarget.index;
              const inserted: EditorialDocumentBlock[] = selected.map((item) => ({ clientId: `media-${crypto.randomUUID()}`, type: "media", item, editorialComment: "" }));
              setBlocks((current) => [...current.slice(0, insertIndex), ...inserted, ...current.slice(insertIndex)]);
            }
            setBrowserTarget(null);
          }} /></div>
        </div>
      </div>, document.body,
    ) : null}
    <div>{hasEmptyContentBlock ? <p className="mb-2 text-sm text-amber-700">Заполните пустые заголовки и текстовые блоки.</p> : null}{hasEmptyGroup ? <p className="mb-2 text-sm text-amber-700">Добавьте хотя бы одну запись в каждый набор.</p> : null}<Button disabled={pending || hasEmptyContentBlock || hasEmptyGroup} type="submit">{pending ? "Сохраняем…" : "Сохранить подборку"}</Button></div>
  </form>;
}
