import Link from "next/link";
import { X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import type { ArchiveRatingComparison } from "@/app/media-items-catalog-logic";

export function ArchiveRatedAuthorContext({
  averageHref,
  clearHref,
  comparison,
  mineHref,
  profile,
}: {
  averageHref: string;
  clearHref: string;
  comparison: ArchiveRatingComparison;
  mineHref: string;
  profile: { avatarObjectKey: string | null; id: number; name: string };
}) {
  return (
    <section
      aria-label={`Оценки пользователя ${profile.name}`}
      className="archive-paper archive-panel relative z-[60] flex min-w-0 items-center gap-3 border-amber-300/70 bg-amber-100/75 px-4 py-2.5 text-sm shadow-md"
    >
      <Link href={`/users/${profile.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-9 shrink-0 text-xs" name={profile.name} objectKey={profile.avatarObjectKey} />
        <span className="truncate font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4 hover:text-red-950">
          {profile.name}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2 text-xs text-stone-600">
        <span>Сравнивать с оценкой:</span>
        <div
          aria-label="Сравнивать с оценкой"
          className="flex items-center rounded-md border border-stone-300/80 bg-stone-50/70 p-0.5 font-mono text-[10px] uppercase tracking-[0.08em]"
          role="group"
        >
          <Link
            aria-current={comparison === "average" ? "true" : undefined}
            className={`rounded px-2 py-1.5 transition-colors ${comparison === "average" ? "bg-red-900/10 text-red-950 shadow-sm" : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-950"}`}
            href={averageHref}
          >
            Средней
          </Link>
          <Link
            aria-current={comparison === "mine" ? "true" : undefined}
            className={`rounded px-2 py-1.5 transition-colors ${comparison === "mine" ? "bg-red-900/10 text-red-950 shadow-sm" : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-950"}`}
            href={mineHref}
          >
            Моей
          </Link>
        </div>
      </div>
      <Link
        aria-label="Сбросить оценки пользователя"
        className="grid size-9 shrink-0 place-items-center rounded-md text-stone-500 hover:bg-stone-200/70 hover:text-stone-950"
        href={clearHref}
      >
        <X className="size-4" />
      </Link>
    </section>
  );
}
