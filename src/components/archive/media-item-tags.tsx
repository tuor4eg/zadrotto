"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { MEDIA_IDENTITY_FONT_CLASS_NAME } from "@/lib/media/carrier-frame";
import { SearchInput } from "@/components/ui/search-input";
import { changeMediaItemTagAction } from "@/app/media/tag-actions";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { VisibleMediaItemTag } from "@/lib/tags/model";


export function MediaItemTagList({ tags, canAssign, isPending, onRemove }: {
  tags: VisibleMediaItemTag[]; canAssign: boolean; isPending: boolean; onRemove: (tagId: number) => void;
}) {
  return <>{[...tags].sort((a, b) => Number(b.isPublic) - Number(a.isPublic)).map(tag => <span key={tag.id} className={`inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--archive-bg-end)] px-2.5 py-1 text-xs font-medium lowercase leading-5 text-stone-100 transition-colors hover:bg-[var(--archive-bg-start)] hover:text-white ${tag.isPublic ? "" : "border border-dashed border-stone-400/60"}`}>
        <Link className="break-words hover:underline focus-visible:underline" href={`/archive?tag=${encodeURIComponent(tag.code)}`}>{tag.title}</Link>
        {canAssign && tag.isMine && !tag.isEditorial ? <Button type="button" size="icon" variant="ghost" className="size-5 rounded-full text-stone-300 hover:bg-white/15 hover:text-white [&_svg]:size-3" disabled={isPending} aria-label={`Удалить своё назначение: ${tag.title}`} onClick={() => onRemove(tag.id)}><X aria-hidden="true" /></Button> : null}
      </span>)}</>;
}

type Option = { id: number; title: string };
export function MediaItemTags({ tags, mediaItemCode, canAssign }: {
  tags: VisibleMediaItemTag[]; mediaItemCode: string; canAssign: boolean;
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/tags?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(response => response.ok ? response.json() : Promise.reject())
        .then(data => { setOptions(data.items); setError(null); })
        .catch(() => { if (!controller.signal.aborted) setError("Не удалось найти теги."); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  function change(input: { tagId?: number; title?: string; remove?: boolean }) {
    startTransition(async () => {
      const result = await changeMediaItemTagAction({ ...input, mediaItemCode });
      setError(result.error);
      if (!result.error) { setQuery(""); setOptions([]); setIsAdding(false); router.refresh(); }
    });
  }
  const assignedIds = new Set(tags.map(tag => tag.id));
  return <section className="mt-5 grid w-full gap-1 text-sm leading-6 text-stone-800 lg:max-w-[584px]" aria-label="Теги">
    <h3 className={`text-xs font-semibold uppercase leading-6 text-stone-600 ${MEDIA_IDENTITY_FONT_CLASS_NAME}`}>Теги</h3>
    <div className="flex flex-wrap items-center gap-1.5">
      <MediaItemTagList tags={tags} canAssign={canAssign} isPending={isPending} onRemove={tagId => change({ tagId, remove: true })} />
      {canAssign ? <ArchiveTooltip label="Добавить тег" side="bottom">
        <Button type="button" size="icon" className="size-7 rounded-full bg-[var(--archive-bg-end)] hover:bg-[var(--archive-bg-start)]" disabled={isPending} aria-label="Добавить тег" aria-expanded={isAdding} onClick={() => setIsAdding(value => !value)}><Plus aria-hidden="true" /></Button>
      </ArchiveTooltip> : null}
    </div>
    {canAssign && isAdding ? <div className="grid w-full max-w-md gap-2 rounded-md border border-stone-400/40 bg-stone-50/50 p-3">
      <SearchInput aria-label="Найти тег" placeholder="Название тега" maxLength={80} value={query} onChange={event => { setQuery(event.target.value); setOptions([]); }} disabled={isPending} />
      {query.trim() ? <ul className="flex flex-wrap gap-1.5" aria-label="Найденные теги">
        {options.map(option => <li key={option.id}><Button variant="ghost" size="sm" type="button" className="h-auto min-w-0 rounded-full bg-stone-500/15 px-2.5 py-1 text-left text-xs font-medium lowercase leading-5 whitespace-normal text-stone-600 hover:bg-stone-500/25 hover:text-stone-900" disabled={isPending || assignedIds.has(option.id)} onClick={() => change({ tagId: option.id })}>{option.title}{assignedIds.has(option.id) ? " · уже добавлен" : ""}</Button></li>)}
        {!options.some(option => normalizeSearchText(option.title) === normalizeSearchText(query)) ? <li className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="h-auto min-h-11 max-w-full touch-manipulation gap-1 rounded-full bg-stone-500/15 px-2.5 py-1 text-left text-xs font-medium lowercase leading-5 whitespace-normal text-stone-600 hover:bg-stone-500/25 hover:text-stone-900 sm:min-h-7 [&_svg]:size-3"
            disabled={isPending}
            aria-label={`Создать тег «${query.trim()}» и добавить`}
            onPointerDown={event => {
              // Keep the iOS keyboard from moving the button before click.
              if (event.pointerType === "touch") event.preventDefault();
            }}
            onClick={() => change({ title: query })}
          >
            <span className="min-w-0 break-words">{query.trim()}</span>
            <Plus aria-hidden="true" />
          </Button>
        </li> : null}
      </ul> : null}
    </div> : null}
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
  </section>;
}
