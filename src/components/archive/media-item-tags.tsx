"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { MEDIA_IDENTITY_FONT_CLASS_NAME } from "@/lib/media/carrier-frame";
import { SearchInput } from "@/components/ui/search-input";
import { changeMediaItemTagAction } from "@/app/media/tag-actions";
import { normalizeSearchText } from "@/lib/search/normalize";
import { useTagSearch } from "@/lib/tags/use-tag-search";
import type { VisibleMediaItemTag } from "@/lib/tags/model";


const tagChipClassName = "rounded-full bg-[var(--archive-bg-end)] px-2.5 py-1 text-xs font-medium lowercase leading-5 text-stone-100 transition-colors hover:bg-[var(--archive-bg-start)] hover:text-white";

export function MediaItemTagList({ tags, canAssign, isPending, onRemove }: {
  tags: VisibleMediaItemTag[]; canAssign: boolean; isPending: boolean; onRemove: (tagId: number) => void;
}) {
  return <>{[...tags].sort((a, b) => Number(b.isPublic) - Number(a.isPublic)).map(tag => {
    const href = `/archive?tag=${encodeURIComponent(tag.code)}`;
    const privateClassName = tag.isPublic ? "" : "border border-dashed border-stone-400/60";
    const removable = canAssign && tag.isMine && !tag.isEditorial;
    if (!removable) return <Link key={tag.id} href={href} className={`${tagChipClassName} ${privateClassName}`}>{tag.title}</Link>;
    return <span key={tag.id} className={`inline-flex h-7 min-w-0 items-stretch rounded-full bg-[var(--archive-bg-end)] text-xs font-medium lowercase leading-5 text-stone-100 ${privateClassName}`}>
      <Link className="flex min-w-0 items-center break-words rounded-l-full px-2.5 transition-colors hover:bg-[var(--archive-bg-start)] hover:text-white" href={href}>{tag.title}</Link>
      <button type="button" className="aspect-square h-full w-auto shrink-0 rounded-full text-stone-300 transition-colors hover:bg-white/15 hover:text-white focus-visible:bg-white/15 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50" disabled={isPending} aria-label={`Удалить своё назначение: ${tag.title}`} onClick={() => onRemove(tag.id)}><X aria-hidden="true" className="mx-auto size-3" /></button>
    </span>;
  })}</>;
}

export function MediaItemTags({ tags, mediaItemCode, canAssign }: {
  tags: VisibleMediaItemTag[]; mediaItemCode: string; canAssign: boolean;
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState("");
  const search = useTagSearch(isAdding ? query : "");
  const options = search?.items ?? [];
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function change(input: { tagId?: number; title?: string; remove?: boolean }) {
    startTransition(async () => {
      const result = await changeMediaItemTagAction({ ...input, mediaItemCode });
      setError(result.error);
      if (!result.error) { setQuery(""); setIsAdding(false); router.refresh(); }
    });
  }
  function closeTagSearch() {
    setIsAdding(false);
    setQuery("");
    setError(null);
  }

  const assignedIds = new Set(tags.map(tag => tag.id));
  const addTagButton = canAssign ? (
    <ArchiveTooltip label="Добавить тег" side={tags.length === 0 ? "right" : "bottom"}>
      <Button type="button" size="icon" className="size-7 rounded-full bg-[var(--archive-bg-end)] hover:bg-[var(--archive-bg-start)]" disabled={isPending} aria-label="Добавить тег" aria-expanded={isAdding} onClick={isAdding ? closeTagSearch : () => setIsAdding(true)}><Plus aria-hidden="true" /></Button>
    </ArchiveTooltip>
  ) : null;
  return <section className="mt-5 grid w-full gap-1 text-sm leading-6 text-stone-800 lg:max-w-[584px]" aria-label="Теги">
    <div className="flex items-center gap-2">
      <h3 className={`text-xs font-semibold uppercase leading-6 text-stone-600 ${MEDIA_IDENTITY_FONT_CLASS_NAME}`}>Теги</h3>
      {tags.length === 0 ? addTagButton : null}
    </div>
    {tags.length > 0 ? (
      <div className="flex flex-wrap items-center gap-1.5">
        <MediaItemTagList tags={tags} canAssign={canAssign} isPending={isPending} onRemove={tagId => change({ tagId, remove: true })} />
        {addTagButton}
      </div>
    ) : null}
    {canAssign && isAdding ? <div className="grid w-full gap-2 py-3">
      <SearchInput
        aria-label="Найти тег"
        placeholder="Название тега"
        maxLength={80}
        value={query}
        onChange={event => { setQuery(event.target.value); setError(null); }}
        disabled={isPending}
        onClose={closeTagSearch}
        closeLabel="Закрыть добавление тега"
      />
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
    {error || search?.error ? <p role="alert" className="text-xs text-red-700">{error ?? search?.error}</p> : null}
  </section>;
}
