import Link from "next/link";
import { AdminEntityEditLink } from "@/components/archive/admin-entity-edit-link";
import { Shapes, X } from "lucide-react";
import type { MediaItemGenre } from "@/lib/media/genres";

export function ArchiveSelectedGenre({ genre, clearHref, adminCanEdit = false }: { genre: MediaItemGenre; clearHref: string; adminCanEdit?: boolean }) {
  return <section aria-label="Выбранный жанр" className="archive-paper archive-panel flex min-w-0 flex-wrap items-center gap-3 border-amber-300/70 bg-amber-100/75 px-4 py-2.5 text-sm shadow-md">
    <Shapes className="size-5 shrink-0 text-stone-500" aria-hidden="true" />
    <div className="min-w-0 flex-1 break-words font-semibold text-stone-900">Жанр: {genre.name}</div>
    {adminCanEdit ? <AdminEntityEditLink ariaLabel={`Редактировать жанр ${genre.name}`} href={`/admin/genres/${genre.id}/edit`} tooltipLabel="Редактировать жанр" tooltipSide="bottom" /> : null}
    <Link href={clearHref} aria-label="Сбросить выбранный жанр" className="grid size-9 shrink-0 place-items-center rounded-md text-stone-500 hover:bg-stone-200/70 hover:text-stone-950"><X className="size-4" /></Link>
  </section>;
}
