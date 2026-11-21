import Link from "next/link";
import { Tag, X } from "lucide-react";

export function ArchiveSelectedTag({ tag, clearHref }: { tag: { title: string }; clearHref: string }) {
  return <section aria-label="Выбранный тег" className="archive-paper archive-panel flex min-w-0 flex-wrap items-center gap-3 border-amber-300/70 bg-amber-100/75 px-4 py-2.5 text-sm shadow-md">
    <Tag className="size-5 shrink-0 text-stone-500" aria-hidden="true" />
    <div className="min-w-0 flex-1 break-words font-semibold text-stone-900">Тег: {tag.title}</div>
    <Link href={clearHref} aria-label="Сбросить выбранный тег" className="grid size-9 shrink-0 place-items-center rounded-md text-stone-500 hover:bg-stone-200/70 hover:text-stone-950"><X className="size-4" /></Link>
  </section>;
}
